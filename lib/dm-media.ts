/**
 * Delivering a campaign's picture or video.
 *
 * Instagram will not carry media in a private reply, and will not accept any
 * media for someone who has not written to us. The auto-DM therefore ships a
 * button; tapping it (or simply replying) opens a 24-hour window, and this is
 * what fills that window.
 *
 * The `followup_sent_at` stamp on the log row is the whole idempotency story:
 * one delivery per person per campaign, so a chatty thread cannot re-trigger it.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { sendAttachment, type PrivateReplyButton } from "@/lib/instagram";
import {
  mediaPostbackPayload,
  parseAttachments,
  rejectButtonLabel,
  rejectDmForButton,
  type DmAttachment,
} from "@/lib/dm-attachments";

type Admin = ReturnType<typeof createAdminClient>;

/** Small human-ish gap between attachments, and the order stays intelligible. */
const GAP_MIN_MS = 600;
const GAP_MAX_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MediaCampaign {
  id: string;
  dm_attachments?: unknown;
  dm_button_label?: string | null;
}

/**
 * The button to attach to this campaign's auto-DM, or null for a plain-text one.
 *
 * The last guard before the Graph call, deliberately duplicating the editor's
 * and the server action's checks. A row that slipped past both — an old row, a
 * hand-edited one — should cost a missing button, not a failed DM.
 */
export function privateReplyButton(
  automation: MediaCampaign,
  dmText: string,
): PrivateReplyButton | null {
  const attachments = parseAttachments(automation.dm_attachments);
  if (attachments.length === 0) return null;

  const label = (automation.dm_button_label ?? "").trim();
  if (rejectButtonLabel(label, true)) return null;
  if (rejectDmForButton(dmText)) return null;

  return { label, payload: mediaPostbackPayload(automation.id) };
}

export interface MediaAccount {
  id: string;
  ig_user_id: string;
  access_token: string;
}

export type DeliveryResult =
  | { delivered: false; reason: string }
  | { delivered: true; count: number; error?: string };

/**
 * Send whatever this campaign owes one person, exactly once.
 *
 * `automationId` comes free with a button tap. A typed reply carries no such
 * hint, so the caller passes null and the newest unfulfilled DM is used —
 * someone who simply writes back still gets their media.
 */
export async function deliverMedia(
  admin: Admin,
  account: MediaAccount,
  recipientId: string,
  automationId: string | null,
): Promise<DeliveryResult> {
  let query = admin
    .from("automation_logs")
    .select("id, automation_id")
    .eq("account_id", account.id)
    .eq("recipient_id", recipientId)
    .eq("status", "sent")
    .is("followup_sent_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (automationId) query = query.eq("automation_id", automationId);

  const { data: pending } = await query.maybeSingle();
  const row = pending as { id: string; automation_id: string | null } | null;
  if (!row?.automation_id) return { delivered: false, reason: "nothing owed" };

  const { data: campaign } = await admin
    .from("automations")
    .select("id, dm_attachments, dm_button_label")
    .eq("id", row.automation_id)
    .maybeSingle();

  const attachments = parseAttachments(
    (campaign as MediaCampaign | null)?.dm_attachments,
  );
  if (attachments.length === 0) {
    return { delivered: false, reason: "campaign has no media" };
  }

  // Claim the row before sending anything. Meta retries webhooks and people
  // double-tap, so without this a duplicate event would deliver twice.
  const { data: claimed } = await admin
    .from("automation_logs")
    .update({ followup_sent_at: new Date().toISOString(), followup_error: null })
    .eq("id", row.id)
    .is("followup_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { delivered: false, reason: "already delivered" };

  const outcome = await sendAll(account, recipientId, attachments);

  if (outcome.sent === 0) {
    // Nothing arrived, so releasing the claim cannot duplicate anything — and
    // it lets the person try again rather than be stuck with a dead button.
    await admin
      .from("automation_logs")
      .update({ followup_sent_at: null, followup_error: outcome.error })
      .eq("id", row.id);
    return { delivered: false, reason: outcome.error ?? "send failed" };
  }

  if (outcome.error) {
    // Partly delivered. The claim stays, because releasing it would re-send
    // whatever already arrived.
    await admin
      .from("automation_logs")
      .update({
        followup_error: `sent ${outcome.sent}/${attachments.length}: ${outcome.error}`,
      })
      .eq("id", row.id);
  }

  return { delivered: true, count: outcome.sent, error: outcome.error };
}

async function sendAll(
  account: MediaAccount,
  recipientId: string,
  attachments: DmAttachment[],
): Promise<{ sent: number; error?: string }> {
  let sent = 0;
  for (const [index, item] of attachments.entries()) {
    if (index > 0) {
      await sleep(
        GAP_MIN_MS + Math.round(Math.random() * (GAP_MAX_MS - GAP_MIN_MS)),
      );
    }
    const res = await sendAttachment(
      account.ig_user_id,
      recipientId,
      item.type,
      item.url,
      account.access_token,
    );
    if (!res.ok) return { sent, error: res.error ?? "Instagram refused it" };
    sent += 1;
  }
  return { sent };
}
