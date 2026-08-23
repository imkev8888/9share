import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPrivateReply, replyToComment } from "@/lib/instagram";
import { loadPostState } from "@/lib/post-comment-state";
import {
  fatalSendReason,
  isPermanentSendError,
  usageHeaderReason,
} from "@/lib/send-budget";

/**
 * Re-running auto-replies that failed, and recovering comments whose log rows
 * were lost when the database was restored.
 *
 * Two Meta rules dictate the shape of this: a private reply must go out within
 * 7 days of the comment, and only one is ever allowed per comment. Failed
 * attempts don't consume that one, which is what makes retrying legitimate.
 */

export const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Failures no amount of retrying will fix. */
const PERMANENT_ERRORS = [
  /invalid for a private reply/iu,
  /requested user cannot be found/iu,
  /archived or deleted this conversation/iu,
  /does not exist, cannot be loaded/iu,
];

/** Marks rows this feature created or resolved, for provenance in the sheet. */
export const RECOVERED_NOTE = "recovered after database restore";

export function isPermanentError(error: string | null): boolean {
  if (!error) return false;
  return PERMANENT_ERRORS.some((pattern) => pattern.test(error));
}

function withinWindow(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < RETRY_WINDOW_MS;
}

function personalize(template: string, username: string | null): string {
  return template.replaceAll("{{username}}", `@${username ?? "there"}`);
}

function parseKeywords(input: string | null | undefined): string[] {
  return (input ?? "")
    .split(/[,;\n|]+/u)
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

export interface FailedRow {
  id: string;
  automation_id: string | null;
  comment_id: string | null;
  commenter_id: string | null;
  commenter_username: string | null;
  comment_text: string | null;
  error: string | null;
  created_at: string;
}

export interface Candidates {
  /** Ready to send: in window, not permanently broken, nobody messaged yet. */
  retryable: FailedRow[];
  /** Past Instagram's 7-day private-reply window — unreachable forever. */
  expired: FailedRow[];
  /** Failed for a reason retrying cannot fix. */
  permanent: FailedRow[];
  /** This person already got a DM for this post. */
  alreadyMessaged: FailedRow[];
}

/**
 * PostgREST puts `in.(...)` filters in the URL, so a few hundred ids is enough
 * to blow the request line. Ask in batches instead.
 */
async function selectIn<T>(
  db: SupabaseClient,
  columns: string,
  column: string,
  values: string[],
): Promise<T[]> {
  const out: T[] = [];
  const size = 100;
  for (let i = 0; i < values.length; i += size) {
    const { data } = await db
      .from("automation_logs")
      .select(columns)
      .eq("status", "sent")
      .in(column, values.slice(i, i + size));
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/**
 * Split every failed row for an account into what can and cannot be retried.
 * The dedup checks mirror the webhook's own rules so a retry can never send
 * where the live automation would have declined to.
 */
export async function loadCandidates(
  db: SupabaseClient,
  accountId: string,
  automationId?: string | null,
): Promise<Candidates> {
  let query = db
    .from("automation_logs")
    .select(
      "id, automation_id, comment_id, commenter_id, commenter_username, comment_text, error, created_at",
    )
    .eq("account_id", accountId)
    .eq("status", "failed")
    .not("comment_id", "is", null)
    .order("created_at", { ascending: true });
  if (automationId) query = query.eq("automation_id", automationId);

  const { data } = await query.limit(2000);
  const failed = (data ?? []) as FailedRow[];

  const result: Candidates = {
    retryable: [],
    expired: [],
    permanent: [],
    alreadyMessaged: [],
  };
  if (failed.length === 0) return result;

  const commentIds = [...new Set(failed.map((r) => r.comment_id!))];
  const commenterIds = [
    ...new Set(failed.map((r) => r.commenter_id).filter(Boolean) as string[]),
  ];

  const [sentForComment, sentForCommenter] = await Promise.all([
    selectIn<{ comment_id: string }>(db, "comment_id", "comment_id", commentIds),
    selectIn<{ automation_id: string | null; commenter_id: string | null }>(
      db,
      "automation_id, commenter_id",
      "commenter_id",
      commenterIds,
    ),
  ]);

  const sentComments = new Set(sentForComment.map((r) => r.comment_id));
  const sentPairs = new Set(
    sentForCommenter.map((r) => `${r.automation_id}:${r.commenter_id}`),
  );

  for (const row of failed) {
    if (
      sentComments.has(row.comment_id!) ||
      sentPairs.has(`${row.automation_id}:${row.commenter_id}`)
    ) {
      result.alreadyMessaged.push(row);
    } else if (!withinWindow(row.created_at)) {
      result.expired.push(row);
    } else if (isPermanentError(row.error)) {
      result.permanent.push(row);
    } else {
      result.retryable.push(row);
    }
  }
  return result;
}

export interface AutomationRow {
  id: string;
  name: string;
  keyword: string | null;
  dm_message: string;
  public_reply: string | null;
  ig_media_id: string | null;
  sent_count: number | null;
  is_active: boolean;
}

export interface AccountRow {
  id: string;
  user_id: string;
  ig_user_id: string;
  access_token: string;
}

export type Decision =
  | { action: "send"; row: FailedRow; dm: string; reply: string | null }
  | { action: "skip"; row: FailedRow; reason: string }
  | { action: "record"; commentId: string; username: string | null; text: string; replyText: string };

export interface Reconciliation {
  automationId: string;
  /** Rows resolved as skipped during this pass. */
  skipped: number;
  /** Gap comments that already had our reply and were re-recorded as sent. */
  recorded: number;
  /** Gap comments that never got anything and were added to the queue. */
  queued: number;
  /** Rows still waiting to be sent. */
  sendable: Decision[];
  /** Set when the post itself is gone. */
  postGone: boolean;
  error?: string;
}

/**
 * Bring one post fully up to date without sending anything: resolve which
 * failed rows are already handled, re-record comments whose logs the restore
 * wiped, and queue comments that were genuinely missed.
 *
 * Everything is derived from a single sweep of the post's comments edge, the
 * only place Instagram exposes who wrote a reply.
 */
export async function reconcilePost(
  db: SupabaseClient,
  account: AccountRow,
  automation: AutomationRow,
  failedRows: FailedRow[],
  options: { apply: boolean },
): Promise<Reconciliation> {
  const out: Reconciliation = {
    automationId: automation.id,
    skipped: 0,
    recorded: 0,
    queued: 0,
    sendable: [],
    postGone: false,
  };
  if (!automation.ig_media_id) {
    out.error = "automation has no media id";
    return out;
  }

  const loaded = await loadPostState(
    automation.ig_media_id,
    account.access_token,
    account.ig_user_id,
    automation.public_reply,
  );

  if (!loaded.ok) {
    out.postGone = loaded.gone;
    out.error = loaded.error;
    if (loaded.gone && options.apply && failedRows.length) {
      await markSkipped(
        db,
        failedRows.map((r) => r.id),
        "the post was deleted on Instagram",
      );
      out.skipped = failedRows.length;
    }
    return out;
  }

  const state = loaded.state;
  const skipIds: { id: string; reason: string }[] = [];

  for (const row of failedRows) {
    const commentId = row.comment_id!;
    if (!state.exists(commentId)) {
      skipIds.push({ id: row.id, reason: "the comment was deleted" });
      continue;
    }
    const handled = state.handledBy(commentId);
    if (handled?.kind === "manual") {
      skipIds.push({ id: row.id, reason: "you already replied to this comment" });
      continue;
    }
    if (handled?.kind === "automation") {
      // The public reply only goes out after a successful DM, so its presence
      // means this person already heard from us and the log row is stale.
      skipIds.push({
        id: row.id,
        reason: "already answered by the automation",
      });
      continue;
    }
    out.sendable.push({
      action: "send",
      row,
      dm: personalize(automation.dm_message, row.commenter_username),
      reply: automation.public_reply?.trim()
        ? personalize(automation.public_reply, row.commenter_username)
        : null,
    });
  }

  // Comments the restore left with no log row at all.
  const known = new Set(failedRows.map((r) => r.comment_id));
  const { data: loggedRows } = await db
    .from("automation_logs")
    .select("comment_id")
    .eq("automation_id", automation.id)
    .not("comment_id", "is", null)
    .limit(5000);
  for (const r of (loggedRows ?? []) as { comment_id: string }[]) {
    known.add(r.comment_id);
  }

  const keywords = parseKeywords(automation.keyword);
  const gapRecord: Decision[] = [];
  const gapQueue: {
    commentId: string;
    commenterId: string | null;
    username: string | null;
    text: string;
    timestamp: string;
  }[] = [];

  for (const comment of state.inbound) {
    if (known.has(comment.id)) continue;
    if (!withinWindow(comment.timestamp)) continue;
    const text = comment.text ?? "";
    if (
      keywords.length > 0 &&
      !keywords.some((keyword) => text.toLowerCase().includes(keyword))
    ) {
      continue;
    }
    const handled = state.handledBy(comment.id);
    if (handled) {
      gapRecord.push({
        action: "record",
        commentId: comment.id,
        username: comment.from?.username ?? null,
        text,
        replyText: handled.text,
      });
      continue;
    }
    gapQueue.push({
      commentId: comment.id,
      commenterId: comment.from?.id ?? null,
      username: comment.from?.username ?? null,
      text,
      timestamp: comment.timestamp ?? new Date().toISOString(),
    });
  }

  out.recorded = gapRecord.length;
  out.queued = gapQueue.length;
  out.skipped = skipIds.length;

  if (!options.apply) {
    out.sendable.push(...gapRecord);
    return out;
  }

  if (skipIds.length) {
    const byReason = new Map<string, string[]>();
    for (const { id, reason } of skipIds) {
      byReason.set(reason, [...(byReason.get(reason) ?? []), id]);
    }
    for (const [reason, ids] of byReason) await markSkipped(db, ids, reason);
  }

  for (const entry of gapRecord) {
    if (entry.action !== "record") continue;
    await db.from("automation_logs").insert({
      automation_id: automation.id,
      account_id: account.id,
      user_id: account.user_id,
      comment_id: entry.commentId,
      commenter_username: entry.username,
      comment_text: entry.text,
      public_reply_text: entry.replyText,
      status: "sent",
      source: "automation",
      error: RECOVERED_NOTE,
    });
  }

  for (const entry of gapQueue) {
    const { data: inserted } = await db
      .from("automation_logs")
      .insert({
        automation_id: automation.id,
        account_id: account.id,
        user_id: account.user_id,
        comment_id: entry.commentId,
        commenter_id: entry.commenterId,
        commenter_username: entry.username,
        comment_text: entry.text,
        status: "failed",
        source: "automation",
        error: `missed while the database was being restored — ${RECOVERED_NOTE}`,
      })
      .select(
        "id, automation_id, comment_id, commenter_id, commenter_username, comment_text, error, created_at",
      )
      .maybeSingle();
    if (inserted) {
      out.sendable.push({
        action: "send",
        row: inserted as FailedRow,
        dm: personalize(automation.dm_message, entry.username),
        reply: automation.public_reply?.trim()
          ? personalize(automation.public_reply, entry.username)
          : null,
      });
    }
  }

  return out;
}

async function markSkipped(
  db: SupabaseClient,
  ids: string[],
  reason: string,
): Promise<void> {
  if (!ids.length) return;
  await db
    .from("automation_logs")
    .update({ status: "skipped", error: reason })
    .in("id", ids);
}

export interface SendOutcome {
  ok: boolean;
  /** Set when the whole drip should stop, not just this one message. */
  fatal?: string;
  /** This comment is a dead end, but the API is fine — don't blame the run. */
  permanent?: boolean;
  error?: string;
}

/** Send exactly one queued reply and fold the result back into its log row. */
export async function sendOne(
  db: SupabaseClient,
  account: AccountRow,
  automation: AutomationRow,
  decision: Extract<Decision, { action: "send" }>,
): Promise<SendOutcome> {
  const { row, dm, reply } = decision;
  const result = await sendPrivateReply(
    account.ig_user_id,
    row.comment_id!,
    dm,
    account.access_token,
  );

  if (!result.ok) {
    const fatal = fatalSendReason(result.raw, result.error ?? "");
    const permanent =
      isPermanentSendError(result.raw) ||
      isPermanentError(result.error ?? null);
    await db
      .from("automation_logs")
      .update({
        status: permanent ? "skipped" : "failed",
        error: result.error ?? "send failed",
      })
      .eq("id", row.id);
    return {
      ok: false,
      permanent,
      fatal: fatal ?? undefined,
      error: result.error,
    };
  }

  let publicReplyText: string | null = null;
  let publicReplyId: string | null = null;
  if (reply) {
    const posted = await replyToComment(
      row.comment_id!,
      reply,
      account.access_token,
    ).catch(() => ({ ok: false as const, id: undefined }));
    if (posted.ok && posted.id) {
      publicReplyText = reply;
      publicReplyId = posted.id;
    }
  }

  await db
    .from("automation_logs")
    .update({
      status: "sent",
      error: null,
      dm_text: dm,
      public_reply_text: publicReplyText,
      public_reply_id: publicReplyId,
    })
    .eq("id", row.id);

  await db
    .from("automations")
    .update({ sent_count: (automation.sent_count ?? 0) + 1 })
    .eq("id", automation.id);

  const headerWarning = result.headers
    ? usageHeaderReason(result.headers)
    : null;
  return { ok: true, fatal: headerWarning ?? undefined };
}
