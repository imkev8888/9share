import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface AdoptOptions {
  admin: AdminClient;
  /** Which channel column links an automation: Instagram or Facebook. */
  column: "account_id" | "fb_page_id";
  /** Our channel row id, freshly created or reused by the reconnect upsert. */
  channelId: string;
  /** Stable external id: Instagram ig_user_id or Facebook page_id. */
  channelRef: string;
  userId: string;
}

/**
 * Re-link the automations a previous disconnect orphaned.
 *
 * Deleting a channel row sets account_id / fb_page_id to null rather than
 * cascading, so the automation and its logs survive but have no channel to
 * run on. channel_ref survives the delete, so a reconnect can find them again
 * even though the channel row came back with a different id.
 *
 * Skips any orphan whose post already has an automation on the reconnected
 * channel, since that would break the one-automation-per-post uniqueness.
 */
export async function adoptOrphanedAutomations({
  admin,
  column,
  channelId,
  channelRef,
  userId,
}: AdoptOptions): Promise<number> {
  const platform = column === "account_id" ? "instagram" : "facebook";

  const { data: orphans } = await admin
    .from("automations")
    .select("id, ig_media_id")
    .eq("channel_ref", channelRef)
    .eq("platform", platform)
    .is("account_id", null)
    .is("fb_page_id", null);

  if (!orphans?.length) return 0;

  const { data: current } = await admin
    .from("automations")
    .select("ig_media_id")
    .eq(column, channelId);

  const taken = new Set((current ?? []).map((a) => a.ig_media_id));
  const adoptable: string[] = [];

  for (const orphan of orphans) {
    if (taken.has(orphan.ig_media_id)) continue;
    taken.add(orphan.ig_media_id);
    adoptable.push(orphan.id);
  }

  if (adoptable.length === 0) return 0;

  const { error } = await admin
    .from("automations")
    .update({ [column]: channelId, user_id: userId })
    .in("id", adoptable);

  if (error) return 0;

  // Their history lost the channel link too, and is keyed by automation_id.
  await admin
    .from("automation_logs")
    .update({ [column]: channelId, user_id: userId })
    .in("automation_id", adoptable);

  return adoptable.length;
}
