import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkGate,
  ensureDripState,
  getSendUsage,
  halt,
  listAccountsWithQueue,
  recordSend,
  MAX_CONSECUTIVE_FAILURES,
} from "@/lib/send-budget";
import {
  countQueued,
  guardBeforeSend,
  loadCandidates,
  nextQueued,
  reconcilePost,
  sendOne,
  type AccountRow,
  type AutomationRow,
  type FailedRow,
} from "@/lib/retry-failed";
import { truncateText } from "@/lib/truncate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Delivers the queue you built from the Tracking sheet, one message at a time.
 *
 * Runs every two minutes and sends at most a single reply per account per
 * invocation. Doing the pacing this way means a burst is not merely
 * discouraged but structurally impossible: there is no loop that could emit
 * one, even if invocations overlap or a retry fires unexpectedly.
 *
 * The queue is the only enable signal. Nothing is ever sent that somebody did
 * not explicitly ask for, so an idle queue means an idle worker.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // `?dry=1` answers "what is actually still sendable?" and `?reconcile=1`
  // writes those conclusions back. Neither sends a message.
  const params = request.nextUrl.searchParams;
  if (params.get("dry") === "1" || params.get("reconcile") === "1") {
    return NextResponse.json(
      await sweep(
        admin,
        params.get("accountId"),
        params.get("reconcile") === "1",
      ),
    );
  }

  const accountIds = await listAccountsWithQueue(admin);
  const results: unknown[] = [];

  for (const accountId of accountIds.slice(0, 3)) {
    try {
      results.push(await drainOne(admin, accountId));
    } catch (error) {
      console.error(`[retry-drain] account ${accountId}`, error);
      results.push({
        accountId,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return NextResponse.json({ accounts: accountIds.length, results });
}

/** Classify the backlog, optionally writing the conclusions back. Never sends. */
async function sweep(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string | null,
  apply: boolean,
) {
  let query = admin
    .from("instagram_accounts")
    .select("id, user_id, ig_user_id, access_token");
  if (accountId) query = query.eq("id", accountId);
  const { data } = await query;

  const report = [];
  for (const account of ((data ?? []) as AccountRow[]).slice(0, 4)) {
    const candidates = await loadCandidates(admin, account.id);
    if (candidates.retryable.length === 0) continue;

    const byAutomation = new Map<string, FailedRow[]>();
    for (const row of candidates.retryable) {
      if (!row.automation_id) continue;
      byAutomation.set(row.automation_id, [
        ...(byAutomation.get(row.automation_id) ?? []),
        row,
      ]);
    }

    const posts = [];
    for (const [automationId, rows] of [...byAutomation].slice(0, 3)) {
      const automation = await loadAutomation(admin, automationId);
      if (!automation) continue;
      const pass = await reconcilePost(admin, account, automation, rows, {
        apply,
      });
      posts.push({
        name: truncateText(automation.name, 40),
        failedRows: rows.length,
        sendable: pass.sendable.filter((d) => d.action === "send").length,
        skipped: pass.skipped,
        recorded: pass.recorded,
        queued: pass.queued,
        postGone: pass.postGone,
        error: pass.error,
      });
    }

    report.push({
      accountId: account.id,
      queued: await countQueued(admin, account.id),
      queue: {
        retryable: candidates.retryable.length,
        expired: candidates.expired.length,
        permanent: candidates.permanent.length,
        alreadyMessaged: candidates.alreadyMessaged.length,
      },
      posts,
    });
  }
  return { applied: apply, sentAnything: false, accounts: report };
}

async function loadAutomation(
  admin: ReturnType<typeof createAdminClient>,
  automationId: string,
): Promise<AutomationRow | null> {
  const { data } = await admin
    .from("automations")
    .select(
      "id, name, keyword, dm_message, public_reply, ig_media_id, sent_count, is_active, dm_attachments, dm_button_label",
    )
    .eq("id", automationId)
    .maybeSingle();
  return (data as AutomationRow | null) ?? null;
}

async function drainOne(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
) {
  const { data: accountData } = await admin
    .from("instagram_accounts")
    .select("id, user_id, ig_user_id, access_token")
    .eq("id", accountId)
    .maybeSingle();
  const account = accountData as AccountRow | null;
  if (!account) {
    return { accountId, skipped: "the Instagram account is no longer connected" };
  }

  const drip = await ensureDripState(admin, account.id, account.user_id);
  const usage = await getSendUsage(admin, account.id);
  const gate = checkGate(drip, usage);
  if (!gate.allowed) {
    return { accountId, skipped: gate.reason, usage };
  }

  const row = await nextQueued(admin, account.id);
  if (!row || !row.automation_id) {
    return { accountId, done: true, usage };
  }

  const automation = await loadAutomation(admin, row.automation_id);
  if (!automation) {
    // Unqueue it, or it sits at the head of the queue blocking everything else.
    await admin
      .from("automation_logs")
      .update({ retry_queued_at: null })
      .eq("id", row.id);
    return { accountId, logId: row.id, skipped: "the automation is gone" };
  }

  // Queued rows may have sat for hours, so re-check right before sending: a
  // reply the user made by hand in the meantime must win over the queue.
  const blocked = await guardBeforeSend(admin, account, automation, row);
  if (blocked) {
    await admin
      .from("automation_logs")
      .update({ status: "skipped", error: blocked, retry_queued_at: null })
      .eq("id", row.id);
    return {
      accountId,
      logId: row.id,
      skippedRow: blocked,
      remaining: await countQueued(admin, account.id),
      usage,
    };
  }

  const outcome = await sendOne(admin, account, automation, {
    action: "send",
    row,
    dm: personalize(automation.dm_message, row.commenter_username),
    reply: automation.public_reply?.trim()
      ? personalize(automation.public_reply, row.commenter_username)
      : null,
  });

  // A comment that simply can't be replied to is not a sign of trouble, so it
  // neither counts against the breaker nor resets it.
  const healthy = outcome.ok || outcome.permanent === true;
  await recordSend(admin, drip.id, healthy, drip.consecutive_failures ?? 0);

  if (outcome.fatal) {
    await halt(admin, drip.id, outcome.fatal);
  } else if (
    !healthy &&
    (drip.consecutive_failures ?? 0) + 1 >= MAX_CONSECUTIVE_FAILURES
  ) {
    await halt(
      admin,
      drip.id,
      `${MAX_CONSECUTIVE_FAILURES} sends failed in a row — last error: ${outcome.error ?? "unknown"}`,
    );
  }

  return {
    accountId,
    automationId: automation.id,
    logId: row.id,
    sent: outcome.ok,
    permanent: outcome.permanent,
    error: outcome.error,
    halted: outcome.fatal,
    remaining: await countQueued(admin, account.id),
    usage,
  };
}

function personalize(template: string, username: string | null): string {
  return template.replaceAll("{{username}}", `@${username ?? "there"}`);
}
