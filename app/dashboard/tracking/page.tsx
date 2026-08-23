import { requireAutomationAccess } from "@/lib/product-gate";
import {
  TrackingBoard,
  PAGE_SIZE,
  type Interaction,
  type PostGroup,
} from "@/components/tracking-board";
import { SheetIcon } from "@/components/icons";
import { isPermanentError, RETRY_WINDOW_MS } from "@/lib/retry-failed";

/** Rows whose campaign was deleted still deserve a home. */
const DELETED = "__deleted__";

export default async function TrackingPage() {
  const { supabase, user } = await requireAutomationAccess();

  const [{ data: automations }, recent, manual, counts, recovery] =
    await Promise.all([
      supabase
        .from("automations")
        .select(
          "id, name, keyword, dm_message, public_reply, media_thumbnail, media_permalink, is_active, sent_count, created_at, platform, ig_media_id, account_id, fb_page_id",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      // Newest page per campaign, rather than one flat page for the whole
      // account — otherwise a post with hundreds of comments starves the rest.
      // One extra row per campaign is what tells us there is more to load.
      supabase.rpc("recent_automation_logs", { p_per: PAGE_SIZE + 1 }),
      // Announcements are few and drive the Comment box, so they are never
      // paged; they must not fall off the end of a campaign's first page.
      supabase
        .from("automation_logs")
        .select(
          "id, automation_id, comment_id, commenter_username, comment_text, status, error, source, created_at",
        )
        .eq("user_id", user.id)
        .eq("source", "manual")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.rpc("automation_log_counts"),
      loadRecovery(supabase, user.id),
    ]);

  const inboundByAutomation = groupRows(
    (recent.data ?? []) as (Interaction & { automation_id: string | null })[],
  );
  const manualByAutomation = groupRows(
    (manual.data ?? []) as (Interaction & { automation_id: string | null })[],
  );
  const countsByAutomation = groupCounts(
    (counts.data ?? []) as {
      automation_id: string | null;
      status: string;
      total: number;
    }[],
  );

  const build = (
    key: string,
    base: Omit<PostGroup, "interactions" | "manualComments" | "counts" | "hasMore">,
  ): PostGroup => {
    const page = inboundByAutomation.get(key) ?? [];
    return {
      ...base,
      interactions: page.slice(0, PAGE_SIZE),
      manualComments: manualByAutomation.get(key) ?? [],
      counts: countsByAutomation.get(key) ?? {
        total: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
      },
      hasMore: page.length > PAGE_SIZE,
    };
  };

  const groups: PostGroup[] = (automations ?? []).map((a) =>
    build(a.id, {
      automationId: a.id,
      name: a.name,
      thumbnail: a.media_thumbnail,
      permalink: a.media_permalink,
      keyword: a.keyword,
      dmMessage: a.dm_message,
      publicReply: a.public_reply,
      isActive: a.is_active,
      platform: a.platform,
      mediaId: a.ig_media_id,
      accountId: a.account_id,
      fbPageId: a.fb_page_id,
      recovery: recovery.get(a.id) ?? null,
    }),
  );

  if (
    (inboundByAutomation.get(DELETED)?.length ?? 0) > 0 ||
    (manualByAutomation.get(DELETED)?.length ?? 0) > 0
  ) {
    groups.push(
      build(DELETED, {
        automationId: null,
        name: "Deleted automations",
        thumbnail: null,
        permalink: null,
        keyword: null,
        dmMessage: null,
        publicReply: null,
        isActive: false,
        platform: null,
        mediaId: null,
        accountId: null,
        fbPageId: null,
        recovery: null,
      }),
    );
  }

  // Headline numbers come from the same exact counts as the per-campaign chips,
  // so the two can never disagree.
  const totals = { sent: 0, skipped: 0, failed: 0 };
  for (const c of countsByAutomation.values()) {
    totals.sent += c.sent;
    totals.skipped += c.skipped;
    totals.failed += c.failed;
  }

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

function groupRows(rows: (Interaction & { automation_id: string | null })[]) {
  const byAutomation = new Map<string, Interaction[]>();
  for (const row of rows) {
    const key = row.automation_id ?? DELETED;
    if (!byAutomation.has(key)) byAutomation.set(key, []);
    byAutomation.get(key)!.push({
      id: row.id,
      comment_id: row.comment_id,
      commenter_username: row.commenter_username,
      comment_text: row.comment_text,
      status: row.status,
      error: row.error,
      source: row.source,
      created_at: row.created_at,
    });
  }
  return byAutomation;
}

function groupCounts(
  rows: { automation_id: string | null; status: string; total: number }[],
) {
  const byAutomation = new Map<string, PostGroup["counts"]>();
  for (const row of rows) {
    const key = row.automation_id ?? DELETED;
    const entry =
      byAutomation.get(key) ?? { total: 0, sent: 0, skipped: 0, failed: 0 };
    const n = Number(row.total) || 0;
    entry.total += n;
    if (row.status === "sent") entry.sent += n;
    else if (row.status === "skipped") entry.skipped += n;
    else if (row.status === "failed") entry.failed += n;
    byAutomation.set(key, entry);
  }
  return byAutomation;
}

/**
 * Per-post recovery numbers, counted from every failed row rather than the
 * capped page above — the post with 200+ failures cannot otherwise show a real
 * number. Uses the same 7-day window and permanent-error rules as the sender,
 * so the warning badge never promises a message that cannot go out.
 */
async function loadRecovery(
  supabase: Awaited<ReturnType<typeof requireAutomationAccess>>["supabase"],
  userId: string,
) {
  const { data } = await supabase
    .from("automation_logs")
    .select("automation_id, created_at, error, retry_queued_at")
    .eq("user_id", userId)
    .eq("status", "failed")
    .not("comment_id", "is", null)
    .limit(5000);

  const byPost = new Map<
    string,
    { recoverable: number; queued: number; expiresAt: string | null }
  >();
  for (const row of (data ?? []) as {
    automation_id: string | null;
    created_at: string;
    error: string | null;
    retry_queued_at: string | null;
  }[]) {
    if (!row.automation_id) continue;
    const deadline = new Date(row.created_at).getTime() + RETRY_WINDOW_MS;
    if (deadline <= Date.now()) continue;
    if (isPermanentError(row.error)) continue;

    const entry =
      byPost.get(row.automation_id) ??
      { recoverable: 0, queued: 0, expiresAt: null };
    entry.recoverable += 1;
    if (row.retry_queued_at) entry.queued += 1;
    const iso = new Date(deadline).toISOString();
    if (!entry.expiresAt || iso < entry.expiresAt) entry.expiresAt = iso;
    byPost.set(row.automation_id, entry);
  }
  return byPost;
}
