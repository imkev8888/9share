import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkGate,
  ensureDripState,
  getSendUsage,
  RETRY_HOURLY_LIMIT,
} from "@/lib/send-budget";
import {
  loadCandidates,
  reconcilePost,
  RECOVERED_NOTE,
  type AccountRow,
  type AutomationRow,
  type FailedRow,
} from "@/lib/retry-failed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sweeping a post is several Graph calls, so bound how many run per request. */
const MAX_POSTS_PER_REQUEST = 3;

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

export async function GET() {
  const resolved = await resolveAccount();
  if (!resolved.ok) return resolved.response;
  const { account, userId } = resolved;

  const admin = createAdminClient();
  const [candidates, usage, state] = await Promise.all([
    loadCandidates(admin, account.id),
    getSendUsage(admin, account.id),
    ensureDripState(admin, account.id, userId),
  ]);

  const gate = checkGate(state, usage);
  const remaining = candidates.retryable.length;
  const hoursLeft = remaining / Math.max(1, RETRY_HOURLY_LIMIT);

  // Rows this feature created for comments the restore lost.
  const { count: recovered } = await admin
    .from("automation_logs")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .like("error", `%${RECOVERED_NOTE}%`);

  return NextResponse.json({
    queue: {
      retryable: remaining,
      expired: candidates.expired.length,
      permanent: candidates.permanent.length,
      alreadyMessaged: candidates.alreadyMessaged.length,
    },
    recoveredRows: recovered ?? 0,
    usage,
    drip: {
      enabled: state.enabled,
      haltedReason: state.halted_reason,
      lastSendAt: state.last_send_at,
      nextSendAfter: state.next_send_after,
      blockedReason: gate.allowed ? null : gate.reason,
    },
    etaHours: remaining > 0 ? Math.ceil(hoursLeft) : 0,
  });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveAccount();
  if (!resolved.ok) return resolved.response;
  const { account, userId } = resolved;

  let body: { action?: string; automationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const state = await ensureDripState(admin, account.id, userId);

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
    return NextResponse.json({ ok: true, enabled: true });
  }

  if (body.action === "pause") {
    await admin
      .from("retry_drip_state")
      .update({ enabled: false })
      .eq("id", state.id);
    return NextResponse.json({ ok: true, enabled: false });
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
    const { data: automationData } = await admin
      .from("automations")
      .select(
        "id, name, keyword, dm_message, public_reply, ig_media_id, sent_count, is_active",
      )
      .eq("id", automationId)
      .maybeSingle();
    const automation = automationData as AutomationRow | null;
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
      samples: pass.sendable
        .filter((d) => d.action === "send")
        .slice(0, 5)
        .map((d) =>
          d.action === "send"
            ? {
                username: d.row.commenter_username,
                comment: d.row.comment_text,
              }
            : null,
        )
        .filter(Boolean),
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
