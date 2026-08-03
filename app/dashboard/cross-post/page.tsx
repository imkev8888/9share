import { requireCrossPostAccess } from "@/lib/product-gate";
import {
  CrossPostComposer,
  type ConnectedAccounts,
} from "@/components/cross-post-composer";
import type { CrossPostPlatform } from "@/lib/cross-post/types";

const PLATFORM_LABELS: Record<CrossPostPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  linkedin: "LinkedIn",
  rednote: "RedNote",
  wechat: "WeChat Moments",
};

function targetSummary(
  targets: Array<{ platform: string; status: string }>,
): string {
  if (!targets.length) return "No targets";
  const parts = targets.map(
    (t) =>
      `${PLATFORM_LABELS[t.platform as CrossPostPlatform] ?? t.platform}: ${t.status}`,
  );
  return parts.join(" · ");
}

export default async function CrossPostPage() {
  const { supabase, user } = await requireCrossPostAccess();

  const [
    { data: igAccount },
    { data: fbPages },
    { data: threadsAccount },
    { data: linkedinAccount },
    { data: mcpConnections },
    { data: recentPosts },
  ] = await Promise.all([
    supabase
      .from("instagram_accounts")
      .select("id, username")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("facebook_pages")
      .select("id, page_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("threads_accounts")
      .select("id, username")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("linkedin_accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("mcp_connections").select("id, platform, status, label"),
    supabase
      .from("cross_posts")
      .select(
        `
        id,
        caption,
        status,
        created_at,
        cross_post_targets (platform, status)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const mcp = mcpConnections ?? [];
  const rednote = mcp.find((c) => c.platform === "rednote") ?? null;
  const wechat = mcp.find((c) => c.platform === "wechat") ?? null;

  const accounts: ConnectedAccounts = {
    instagram: igAccount
      ? { id: igAccount.id, label: `@${igAccount.username}` }
      : null,
    facebookPages: (fbPages ?? []).map((p) => ({
      id: p.id,
      label: p.page_name ?? "Facebook Page",
    })),
    threads: threadsAccount
      ? {
          id: threadsAccount.id,
          label: `@${threadsAccount.username ?? "threads"}`,
        }
      : null,
    linkedin: linkedinAccount
      ? { id: linkedinAccount.id, label: linkedinAccount.name ?? "LinkedIn" }
      : null,
    rednote: rednote ? { id: rednote.id, label: rednote.label ?? "RedNote" } : null,
    wechat: wechat ? { id: wechat.id, label: wechat.label ?? "WeChat" } : null,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Cross Post
        </h1>
        <p className="text-sm text-ink-soft">
          Publish to Instagram, Facebook, Threads, LinkedIn, RedNote, and WeChat
          in one go.
        </p>
      </div>

      <CrossPostComposer accounts={accounts} />

      {(recentPosts ?? []).length > 0 && (
        <div className="glass rounded-3xl p-5">
          <h2 className="mb-4 text-lg font-bold text-ink">Recent posts</h2>
          <ul className="space-y-3">
            {(recentPosts ?? []).map((post) => (
              <li
                key={post.id}
                className="rounded-2xl bg-white/60 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="line-clamp-1 font-medium text-ink">
                    {post.caption?.trim() || "(no caption)"}
                  </p>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold capitalize text-ink-soft">
                    {post.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {new Date(post.created_at).toLocaleString()} —{" "}
                  {targetSummary(post.cross_post_targets ?? [])}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
