import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkGate,
  ensureDripState,
  getSendUsage,
  halt,
  recordSend,
  MAX_CONSECUTIVE_FAILURES,
} from "@/lib/send-budget";
import {
  countQueued,
  guardBeforeSend,
  loadCandidates,
  queueRows,
  reconcilePost,
  sendOne,
  unqueueRows,
  RECOVERED_NOTE,
  RETRY_WINDOW_MS,
  type AccountRow,
  type AutomationRow,
  type FailedRow,
} from "@/lib/retry-failed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sweeping a post is several Graph calls, so bound how many run per request. */
const MAX_POSTS_PER_REQUEST = 3;

/**
 * The worker's real cadence, used only to show an honest wait. The cron fires
 * every two minutes and each send arms a 90-150s gap, so roughly half the
 * slots are skipped and messages land about three minutes apart.
 */
const MINUTES_PER_QUEUED_MESSAGE = 3;

async function resolveAccount(): Promise<
  | { ok: true; account: AccountRow; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data } = await supabase
    .from("instagram_accounts")
    .select("id, user_id, ig_user_id, access_token")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No Instagram account connected" },
        { status: 404 },
      ),
    };
  }
  return { ok: true, account: data as AccountRow, userId: user.id };
}

async function loadAutomation(
  admin: ReturnType<typeof createAdminClient>,
  automationId: string,
): Promise<AutomationRow | null> {
  const { data } = await admin
    .from("automations")
    .select(
      "id, name, keyword, dm_message, public_reply, ig_media_id, sent_count, is_active",
    )
    .eq("id", automationId)
    .maybeSingle();
  return (data as AutomationRow | null) ?? null;
}

/**
 * Without `automationId`, the account-wide summary. With one, the full list of
 * that post's recoverable comments — read straight from the database rather
 * than the Tracking page's capped rows, so a post with hundreds of failures
 * shows every one of them.
 */
export async function GET(request: NextRequest) {
  const resolved = await resolveAccount();
  if (!resolved.ok) return resolved.response;
  const { account, userId } = resolved;

  const automationId = request.nextUrl.searchParams.get("automationId");
  const admin = createAdminClient();

  const [candidates, usage, state, queued] = await Promise.all([
    loadCandidates(admin, account.id, automationId),
    getSendUsage(admin, account.id),
    ensureDripState(admin, account.id, userId),
    countQueued(admin, account.id, automationId),
  ]);

  const gate = checkGate(state, usage);
  const drip = {
    haltedReason: state.halted_reason,
    lastSendAt: state.last_send_at,
    nextSendAfter: state.next_send_after,
    blockedReason: gate.allowed ? null : gate.reason,
  };

  if (automationId) {
    const { data: queuedIds } = await admin
      .from("automation_logs")
      .select("id")
      .eq("automation_id", automationId)
      .not("retry_queued_at", "is", null)
      .limit(2000);
    const queuedSet = new Set(
      ((queuedIds ?? []) as { id: string }[]).map((r) => r.id),
    );

    return NextResponse.json({
      automationId,
      queued,
      rows: candidates.retryable.map((row) => ({
        id: row.id,
        username: row.commenter_username,
        comment: row.comment_text,
        expiresAt: new Date(
          new Date(row.created_at).getTime() + RETRY_WINDOW_MS,
        ).toISOString(),
        queued: queuedSet.has(row.id),
      })),
      drip,
      usage,
    });
  }

  // Rows this feature created for comments the restore lost.
  const { count: recovered } = await admin
    .from("automation_logs")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .like("error", `%${RECOVERED_NOTE}%`);

  return NextResponse.json({
    queue: {
      retryable: candidates.retryable.length,
      expired: candidates.expired.length,
      permanent: candidates.permanent.length,
      alreadyMessaged: candidates.alreadyMessaged.length,
    },
    queued,
    recoveredRows: recovered ?? 0,
    usage,
    drip,
    etaMinutes: queued * MINUTES_PER_QUEUED_MESSAGE,
  });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveAccount();
  if (!resolved.ok) return resolved.response;
  const { account, userId } = resolved;

  let body: {
    action?: string;
    automationId?: string;
    logId?: string;
    logIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const state = await ensureDripState(admin, account.id, userId);

  // Clears a tripped circuit breaker. Sends nothing on its own.
  if (body.action === "start") {
    await admin
      .from("retry_drip_state")
      .update({
        enabled: true,
        halted_reason: null,
        halted_at: null,
        consecutive_failures: 0,
      })
      .eq("id", state.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "queue") {
    const ids = await resolveQueueIds(admin, account.id, body);
    const count = await queueRows(admin, ids);
    return NextResponse.json({
      ok: true,
      queued: await countQueued(admin, account.id, body.automationId),
      added: count,
      etaMinutes: count * MINUTES_PER_QUEUED_MESSAGE,
    });
  }

  // Stopping is the same act as emptying the queue: whatever has not gone out
  // yet simply stays failed, ready to be queued again later.
  if (body.action === "unqueue" || body.action === "pause") {
    const cleared = await unqueueRows(
      admin,
      account.id,
      body.automationId ?? null,
    );
    return NextResponse.json({
      ok: true,
      cleared,
      queued: await countQueued(admin, account.id, body.automationId),
    });
  }

  if (body.action === "send") {
    return sendImmediately(admin, account, state, body.logId);
  }

  if (body.action !== "preview" && body.action !== "reconcile") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const apply = body.action === "reconcile";
  const candidates = await loadCandidates(admin, account.id, body.automationId);

  const byAutomation = new Map<string, FailedRow[]>();
  for (const row of candidates.retryable) {
    if (!row.automation_id) continue;
    byAutomation.set(row.automation_id, [
      ...(byAutomation.get(row.automation_id) ?? []),
      row,
    ]);
  }

  // Gap recovery has to look at posts with no failures too, since a comment
  // whose log row was wiped leaves nothing behind to find it by.
  let automationIds = [...byAutomation.keys()];
  if (body.automationId) {
    automationIds = [body.automationId];
  } else {
    const { data: active } = await admin
      .from("automations")
      .select("id")
      .eq("account_id", account.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(60);
    for (const row of (active ?? []) as { id: string }[]) {
      if (!automationIds.includes(row.id)) automationIds.push(row.id);
    }
  }

  const passes = [];
  let swept = 0;
  for (const automationId of automationIds) {
    if (swept >= MAX_POSTS_PER_REQUEST) break;
    const automation = await loadAutomation(admin, automationId);
    if (!automation?.ig_media_id) continue;

    swept += 1;
    const pass = await reconcilePost(
      admin,
      account,
      automation,
      byAutomation.get(automationId) ?? [],
      { apply },
    );
    passes.push({
      automationId,
      name: automation.name,
      willSend: pass.sendable.filter((d) => d.action === "send").length,
      skipped: pass.skipped,
      recorded: pass.recorded,
      queued: pass.queued,
      postGone: pass.postGone,
      error: pass.error,
    });
  }

  return NextResponse.json({
    ok: true,
    applied: apply,
    swept,
    remainingPosts: Math.max(0, automationIds.length - swept),
    passes,
  });
}

/** Either the explicit rows, or every recoverable row on one post. */
async function resolveQueueIds(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  body: { automationId?: string; logIds?: string[] },
): Promise<string[]> {
  if (body.logIds?.length) {
    const { data } = await admin
      .from("automation_logs")
      .select("id")
      .eq("account_id", accountId)
      .in("id", body.logIds.slice(0, 500));
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  }
  const candidates = await loadCandidates(
    admin,
    accountId,
    body.automationId ?? null,
  );
  return candidates.retryable.map((row) => row.id);
}

/**
 * One message, right now, because somebody clicked its button.
 *
 * The guard runs first regardless: the page data behind that click may be
 * minutes old, and messaging a person who has since been answered by hand is
 * the one outcome worth being paranoid about.
 */
async function sendImmediately(
  admin: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  state: Awaited<ReturnType<typeof ensureDripState>>,
  logId: string | undefined,
) {
  if (!logId) {
    return NextResponse.json({ error: "Missing logId" }, { status: 400 });
  }
  if (state.halted_reason) {
    return NextResponse.json(
      { error: `Sending is stopped: ${state.halted_reason}` },
      { status: 409 },
    );
  }

  const usage = await getSendUsage(admin, account.id);
  if (usage.lastHour >= usage.ceilingPerHour) {
    return NextResponse.json(
      {
        error: `Too many messages this hour (${usage.lastHour}/${usage.ceilingPerHour}). Try again shortly.`,
      },
      { status: 429 },
    );
  }

  const { data } = await admin
    .from("automation_logs")
    .select(
      "id, automation_id, comment_id, commenter_id, commenter_username, comment_text, error, created_at",
    )
    .eq("id", logId)
    .eq("account_id", account.id)
    .eq("status", "failed")
    .maybeSingle();
  const row = data as FailedRow | null;
  if (!row?.comment_id || !row.automation_id) {
    return NextResponse.json(
      { error: "That comment is no longer waiting to be sent" },
      { status: 404 },
    );
  }

  const automation = await loadAutomation(admin, row.automation_id);
  if (!automation) {
    return NextResponse.json(
      { error: "That post's automation no longer exists" },
      { status: 404 },
    );
  }

  const blocked = await guardBeforeSend(admin, account, automation, row);
  if (blocked) {
    await admin
      .from("automation_logs")
      .update({ status: "skipped", error: blocked, retry_queued_at: null })
      .eq("id", row.id);
    return NextResponse.json({ ok: true, sent: false, skipped: blocked });
  }

  const outcome = await sendOne(admin, account, automation, {
    action: "send",
    row,
    dm: personalize(automation.dm_message, row.commenter_username),
    reply: automation.public_reply?.trim()
      ? personalize(automation.public_reply, row.commenter_username)
      : null,
  });

  // Manual sends share the worker's cadence, so clicking a few in a row can
  // never add up to a burst on top of whatever the queue is already doing.
  const healthy = outcome.ok || outcome.permanent === true;
  await recordSend(admin, state.id, healthy, state.consecutive_failures ?? 0);

  if (outcome.fatal) {
    await halt(admin, state.id, outcome.fatal);
  } else if (
    !healthy &&
    (state.consecutive_failures ?? 0) + 1 >= MAX_CONSECUTIVE_FAILURES
  ) {
    await halt(
      admin,
      state.id,
      `${MAX_CONSECUTIVE_FAILURES} sends failed in a row — last error: ${outcome.error ?? "unknown"}`,
    );
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error: outcome.error ?? "Instagram refused the message",
        halted: outcome.fatal ?? null,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sent: true, halted: outcome.fatal ?? null });
}

function personalize(template: string, username: string | null): string {
  return template.replaceAll("{{username}}", `@${username ?? "there"}`);
}
