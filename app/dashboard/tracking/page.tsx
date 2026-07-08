import { requireUser } from "@/lib/auth";
import { TrackingBoard, type PostGroup } from "@/components/tracking-board";
import { SheetIcon } from "@/components/icons";

export default async function TrackingPage() {
  const { supabase, user } = await requireUser();

  // Pull automations (the "posts") and every interaction in parallel.
  const [{ data: automations }, { data: logs }] = await Promise.all([
    supabase
      .from("automations")
      .select(
        "id, name, keyword, dm_message, public_reply, media_thumbnail, media_permalink, is_active, sent_count, created_at, platform",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("automation_logs")
      .select(
        "id, automation_id, commenter_username, comment_text, status, error, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // Group interactions under the post (automation) they belong to.
  const byAutomation = new Map<string, PostGroup["interactions"]>();
  for (const log of logs ?? []) {
    const key = log.automation_id ?? "__deleted__";
    if (!byAutomation.has(key)) byAutomation.set(key, []);
    byAutomation.get(key)!.push({
      id: log.id,
      commenter_username: log.commenter_username,
      comment_text: log.comment_text,
      status: log.status,
      error: log.error,
      created_at: log.created_at,
    });
  }

  const groups: PostGroup[] = (automations ?? []).map((a) => {
    const interactions = byAutomation.get(a.id) ?? [];
    return {
      automationId: a.id,
      name: a.name,
      thumbnail: a.media_thumbnail,
      permalink: a.media_permalink,
      keyword: a.keyword,
      dmMessage: a.dm_message,
      publicReply: a.public_reply,
      isActive: a.is_active,
      platform: a.platform,
      interactions,
      counts: countByStatus(interactions),
    };
  });

  // Logs whose automation was deleted still deserve a home.
  const orphan = byAutomation.get("__deleted__");
  if (orphan?.length) {
    groups.push({
      automationId: null,
      name: "Deleted automations",
      thumbnail: null,
      permalink: null,
      keyword: null,
      dmMessage: null,
      publicReply: null,
      isActive: false,
      platform: null,
      interactions: orphan,
      counts: countByStatus(orphan),
    });
  }

  const totals = groups.reduce(
    (acc, g) => {
      acc.sent += g.counts.sent;
      acc.skipped += g.counts.skipped;
      acc.failed += g.counts.failed;
      return acc;
    },
    { sent: 0, skipped: 0, failed: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Tracking sheet
        </h1>
        <p className="text-sm text-ink-soft">
          Every comment, reply and DM — grouped by the post that triggered it.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-brand-50 p-3 text-brand-500">
            <SheetIcon className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-ink">Nothing to track yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Create an automation and, as comments roll in, you&apos;ll see a
            full breakdown per post here.
          </p>
        </div>
      ) : (
        <TrackingBoard groups={groups} totals={totals} />
      )}
    </div>
  );
}

function countByStatus(rows: { status: string }[]) {
  return rows.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.status === "sent") acc.sent += 1;
      else if (r.status === "failed") acc.failed += 1;
      else if (r.status === "skipped") acc.skipped += 1;
      return acc;
    },
    { total: 0, sent: 0, skipped: 0, failed: 0 },
  );
}
