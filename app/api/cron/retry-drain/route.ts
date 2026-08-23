import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkGate,
  getSendUsage,
  halt,
  listActiveDrips,
  recordSend,
  MAX_CONSECUTIVE_FAILURES,
  type DripState,
} from "@/lib/send-budget";
import {
  loadCandidates,
  reconcilePost,
  sendOne,
  type AccountRow,
  type AutomationRow,
  type FailedRow,
} from "@/lib/retry-failed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drains the retry backlog one message at a time.
 *
 * Runs every two minutes and sends at most a single reply per account per
 * invocation. Doing the pacing this way means a burst is not merely
 * discouraged but structurally impossible: there is no loop that could emit
 * one, even if invocations overlap or a retry fires unexpectedly.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // `?dry=1` answers "what would the drip do next?" and `?reconcile=1` tidies
  // the records up for real. Neither sends a message, and neither needs the
  // drip to be enabled.
  const params = request.nextUrl.searchParams;
  if (params.get("dry") === "1" || params.get("reconcile") === "1") {
    return NextResponse.json(
      await sweep(admin, params.get("accountId"), params.get("reconcile") === "1"),
    );
  }

  const drips = await listActiveDrips(admin);
  const results: unknown[] = [];

  for (const drip of drips.slice(0, 3)) {
    try {
      results.push(await drainOne(admin, drip));
    } catch (error) {
      console.error(`[retry-drain] account ${drip.account_id}`, error);
      results.push({
        accountId: drip.account_id,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return NextResponse.json({ accounts: drips.length, results });
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
      const { data: automationData } = await admin
        .from("automations")
        .select(
          "id, name, keyword, dm_message, public_reply, ig_media_id, sent_count, is_active",
        )
        .eq("id", automationId)
        .maybeSingle();
      const automation = automationData as AutomationRow | null;
      if (!automation) continue;
      const pass = await reconcilePost(admin, account, automation, rows, {
        apply,
      });
      posts.push({
        name: automation.name.slice(0, 40),
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

async function drainOne(
  admin: ReturnType<typeof createAdminClient>,
  drip: DripState,
) {
  const usage = await getSendUsage(admin, drip.account_id);
  const gate = checkGate(drip, usage);
  if (!gate.allowed) {
    return { accountId: drip.account_id, skipped: gate.reason, usage };
  }

  const { data: accountData } = await admin
    .from("instagram_accounts")
    .select("id, user_id, ig_user_id, access_token")
    .eq("id", drip.account_id)
    .maybeSingle();
  const account = accountData as AccountRow | null;
  if (!account) {
    await halt(admin, drip.id, "the Instagram account is no longer connected");
    return { accountId: drip.account_id, halted: "account missing" };
  }

  const candidates = await loadCandidates(admin, account.id);
  if (candidates.retryable.length === 0) {
    return { accountId: account.id, done: true, usage };
  }

  const byAutomation = new Map<string, FailedRow[]>();
  for (const row of candidates.retryable) {
    if (!row.automation_id) continue;
    byAutomation.set(row.automation_id, [
      ...(byAutomation.get(row.automation_id) ?? []),
      row,
    ]);
  }

  // Reconciling sweeps a whole post, so keep the per-invocation cost bounded.
  for (const [automationId, rows] of [...byAutomation].slice(0, 2)) {
    const { data: automationData } = await admin
      .from("automations")
      .select(
        "id, name, keyword, dm_message, public_reply, ig_media_id, sent_count, is_active",
      )
      .eq("id", automationId)
      .maybeSingle();
    const automation = automationData as AutomationRow | null;
    if (!automation) continue;

    // A fresh sweep before every send is what catches replies the user made
    // by hand since the last pass, so nobody gets messaged twice.
    const pass = await reconcilePost(admin, account, automation, rows, {
      apply: true,
    });

    const next = pass.sendable.find((d) => d.action === "send");
    if (!next || next.action !== "send") continue;

    const outcome = await sendOne(admin, account, automation, next);
    // A comment that simply can't be replied to is not a sign of trouble, so
    // it neither counts against the breaker nor resets it.
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
      accountId: account.id,
      automationId,
      sent: outcome.ok,
      permanent: outcome.permanent,
      error: outcome.error,
      halted: outcome.fatal,
      reconciled: {
        skipped: pass.skipped,
        recorded: pass.recorded,
        queued: pass.queued,
      },
      remaining: candidates.retryable.length - (outcome.ok ? 1 : 0),
      usage,
    };
  }

  return { accountId: account.id, nothingSendable: true, usage };
}
