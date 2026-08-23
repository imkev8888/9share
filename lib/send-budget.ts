import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pacing and safety rails for delivering queued private replies.
 *
 * Meta's guidance is that private replies should be "real-time consumers of
 * the comments webhook, not batch sweeps over old comments", so a backlog
 * drain is exactly the pattern that attracts spam enforcement. The documented
 * ceiling (750/hour) is not the binding constraint; looking unlike a human is.
 *
 * An earlier version made the queue share one budget with live webhook traffic
 * so real-time replies would take priority. On a busy account that starved the
 * queue completely: live traffic alone exhausted the allowance every hour, so
 * nothing queued could ever go out and the backlog would quietly expire.
 * Queued messages now pace themselves instead, since a person explicitly asked
 * for each one. The ceiling below is a runaway guard, not a priority scheme.
 */

/** Stop everything if total sends in an hour reach this. */
export const MAX_TOTAL_PER_HOUR = Number(
  process.env.RETRY_MAX_TOTAL_PER_HOUR ?? 200,
);
const GAP_MIN_MS = Number(process.env.RETRY_GAP_MIN_MS ?? 90_000);
const GAP_MAX_MS = Number(process.env.RETRY_GAP_MAX_MS ?? 150_000);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A fresh randomized gap, so the cadence never looks mechanical. */
export function nextGapMs(): number {
  const min = Math.max(0, GAP_MIN_MS);
  const max = Math.max(min, GAP_MAX_MS);
  return Math.round(min + Math.random() * (max - min));
}

export const MAX_CONSECUTIVE_FAILURES = 3;

const STATE_FIELDS =
  "id, user_id, account_id, enabled, halted_reason, halted_at, consecutive_failures, last_send_at, next_send_after";

export interface DripState {
  id: string;
  user_id: string;
  account_id: string;
  enabled: boolean;
  halted_reason: string | null;
  halted_at: string | null;
  consecutive_failures: number;
  last_send_at: string | null;
  next_send_after: string | null;
}

export async function getDripState(
  db: SupabaseClient,
  accountId: string,
): Promise<DripState | null> {
  const { data } = await db
    .from("retry_drip_state")
    .select(STATE_FIELDS)
    .eq("account_id", accountId)
    .maybeSingle();
  return (data as DripState | null) ?? null;
}

export async function ensureDripState(
  db: SupabaseClient,
  accountId: string,
  userId: string,
): Promise<DripState> {
  const existing = await getDripState(db, accountId);
  if (existing) return existing;
  const { data, error } = await db
    .from("retry_drip_state")
    .insert({ account_id: accountId, user_id: userId })
    .select(STATE_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data as DripState;
}

/** Accounts with something queued and no tripped breaker. */
export async function listAccountsWithQueue(
  db: SupabaseClient,
): Promise<string[]> {
  const { data } = await db
    .from("automation_logs")
    .select("account_id")
    .not("retry_queued_at", "is", null)
    .not("account_id", "is", null)
    .limit(5000);
  return [
    ...new Set(
      ((data ?? []) as { account_id: string }[]).map((r) => r.account_id),
    ),
  ];
}

export interface SendUsage {
  lastHour: number;
  lastDay: number;
  ceilingPerHour: number;
}

/** Total sends on the account, used only for the runaway guard and display. */
export async function getSendUsage(
  db: SupabaseClient,
  accountId: string,
): Promise<SendUsage> {
  const now = Date.now();
  const [{ count: hour }, { count: day }] = await Promise.all([
    db
      .from("automation_logs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "sent")
      .gte("created_at", new Date(now - HOUR_MS).toISOString()),
    db
      .from("automation_logs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "sent")
      .gte("created_at", new Date(now - DAY_MS).toISOString()),
  ]);
  return {
    lastHour: hour ?? 0,
    lastDay: day ?? 0,
    ceilingPerHour: MAX_TOTAL_PER_HOUR,
  };
}

export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterMs?: number };

/** Every condition that must hold before one queued message may go out. */
export function checkGate(state: DripState, usage: SendUsage): GateResult {
  if (state.halted_reason) {
    return { allowed: false, reason: `halted: ${state.halted_reason}` };
  }
  if (usage.lastHour >= usage.ceilingPerHour) {
    return {
      allowed: false,
      reason: `safety ceiling reached (${usage.lastHour}/${usage.ceilingPerHour} sends this hour)`,
      retryAfterMs: HOUR_MS,
    };
  }
  if (state.next_send_after) {
    const waitMs = new Date(state.next_send_after).getTime() - Date.now();
    if (waitMs > 0) {
      return {
        allowed: false,
        reason: "waiting out the pacing gap",
        retryAfterMs: waitMs,
      };
    }
  }
  return { allowed: true };
}

/** Arm the next randomized gap after a message actually went out. */
export async function recordSend(
  db: SupabaseClient,
  stateId: string,
  succeeded: boolean,
  previousFailures = 0,
) {
  const now = new Date();
  await db
    .from("retry_drip_state")
    .update({
      last_send_at: now.toISOString(),
      next_send_after: new Date(now.getTime() + nextGapMs()).toISOString(),
      consecutive_failures: succeeded ? 0 : previousFailures + 1,
    })
    .eq("id", stateId);
}

export async function halt(
  db: SupabaseClient,
  stateId: string,
  reason: string,
) {
  await db
    .from("retry_drip_state")
    .update({ halted_reason: reason, halted_at: new Date().toISOString() })
    .eq("id", stateId);
}

/**
 * Per-recipient dead ends: this comment can never be replied to, but the API
 * is perfectly healthy. These must not count toward the circuit breaker, or a
 * run of ordinary dead comments would look like an outage and stop the drain.
 *
 * Matched on Meta's numeric codes rather than the message, because the message
 * comes back in whatever language the account is set to.
 */
const PERMANENT_SUBCODES = new Set([
  2534014, // the comment is invalid for a private reply
  2534015, // the requested user cannot be found
  2534022, // already replied to, or outside the allowed messaging window
]);

export function isPermanentSendError(raw: unknown): boolean {
  const err = (
    raw as { error?: { code?: number; error_subcode?: number } } | undefined
  )?.error;
  if (!err) return false;
  if (err.error_subcode && PERMANENT_SUBCODES.has(err.error_subcode)) {
    return true;
  }
  // Code 10 on the messaging edge is the permission/eligibility family: the
  // recipient or comment is out of bounds, and retrying changes nothing.
  return err.code === 10;
}

/**
 * Errors that mean "stop touching the API right now" rather than "this one
 * recipient didn't work". Hitting any of these halts the whole drip until a
 * human restarts it.
 */
export function fatalSendReason(raw: unknown, message: string): string | null {
  const err = (
    raw as { error?: { code?: number; error_subcode?: number } } | undefined
  )?.error;
  const code = err?.code;
  const subcode = err?.error_subcode;

  if (isPermanentSendError(raw)) return null;

  if (code === 613 || subcode === 2534040) {
    return "Instagram rate-limited us (613/2534040)";
  }
  if (subcode === 2534029) {
    return "Instagram restricted messaging on this account (100/2534029)";
  }
  if (code === 551 || subcode === 1545041) {
    return "a recipient has blocked this account (551/1545041)";
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return `Instagram throttled the app (code ${code})`;
  }
  if (/rate limit|too many requests|temporarily blocked/iu.test(message)) {
    return message;
  }
  return null;
}

/**
 * Meta reports its own view of how hard we are pushing. Backing off on this is
 * cheaper than waiting for the error that follows it.
 */
export function usageHeaderReason(headers: Headers): string | null {
  for (const name of ["x-app-usage", "x-business-use-case-usage"]) {
    const raw = headers.get(name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const worst = worstUsage(parsed);
      if (worst.regainMs && worst.regainMs > 0) {
        return `${name} reports a cooldown of ~${Math.ceil(worst.regainMs / 60000)} min`;
      }
      if (worst.percent >= 90) {
        return `${name} at ${worst.percent}% of the allowance`;
      }
    } catch {
      // A malformed header is not a reason to stop sending.
    }
  }
  return null;
}

function worstUsage(parsed: unknown): { percent: number; regainMs: number } {
  let percent = 0;
  let regainMs = 0;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    for (const key of ["call_count", "total_cputime", "total_time"]) {
      const value = obj[key];
      if (typeof value === "number") percent = Math.max(percent, value);
    }
    const regain = obj.estimated_time_to_regain_access;
    if (typeof regain === "number") {
      regainMs = Math.max(regainMs, regain * 60 * 1000);
    }
    Object.values(obj).forEach((value) => {
      if (value && typeof value === "object") visit(value);
    });
  };
  visit(parsed);
  return { percent, regainMs };
}
