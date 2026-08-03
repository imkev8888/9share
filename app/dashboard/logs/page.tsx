import { requireAutomationAccess } from "@/lib/product-gate";
import {
  ActivityFeed,
  type ActivityLog,
  type ActivityPost,
} from "@/components/activity-feed";

export default async function LogsPage() {
  const { supabase, user } = await requireAutomationAccess();

  const [{ data: logs }, { data: igAccount }, { data: automations }] =
    await Promise.all([
      supabase
        .from("automation_logs")
        .select(
          "id, automation_id, account_id, comment_id, commenter_username, comment_text, dm_text, public_reply_text, public_reply_id, status, error, source, created_at, fb_page_id",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("instagram_accounts")
        .select("id, username")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("automations")
        .select(
          "id, ig_media_id, name, media_thumbnail, media_permalink, media_caption, platform, account_id, dm_message, public_reply",
        )
        .eq("user_id", user.id)
        .eq("platform", "instagram")
        .order("created_at", { ascending: false }),
    ]);

  const automationById = new Map(
    (automations ?? []).map((a) => [a.id, a] as const),
  );

  const posts: ActivityPost[] = (automations ?? [])
    .filter((a) => a.account_id && a.ig_media_id)
    .map((a) => ({
      automationId: a.id,
      mediaId: a.ig_media_id,
      name: a.name,
      thumbnail: a.media_thumbnail,
      permalink: a.media_permalink,
      caption: a.media_caption,
      dmTemplate: a.dm_message,
      publicReplyTemplate: a.public_reply,
      accountId: a.account_id,
    }));

  const enrichedLogs: ActivityLog[] = (logs ?? []).map((log) => {
    const auto = log.automation_id
      ? automationById.get(log.automation_id)
      : undefined;
    return {
      ...(log as ActivityLog),
      dm_template: auto?.dm_message ?? null,
      public_reply_template: auto?.public_reply ?? null,
      public_reply_text:
        log.public_reply_text ||
        (log.status === "sent" && auto?.public_reply?.trim()
          ? auto.public_reply
          : null),
      dm_text:
        log.dm_text ||
        (log.status === "sent" && auto?.dm_message
          ? auto.dm_message.replaceAll(
              "{{username}}",
              log.commenter_username ? `@${log.commenter_username}` : "@there",
            )
          : null),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Activity
        </h1>
      </div>

      <ActivityFeed
        accountId={igAccount?.id ?? null}
        username={igAccount?.username ?? null}
        posts={posts}
        initialLogs={enrichedLogs}
      />
    </div>
  );
}
