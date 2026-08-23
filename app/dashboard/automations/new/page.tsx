import Link from "next/link";
import { requireAutomationAccess } from "@/lib/product-gate";
import { getMediaPage, type IgMedia } from "@/lib/instagram";
import { ConnectButton } from "@/components/connect-button";
import { FacebookConnectButton } from "@/components/facebook-connect-button";
import { AutomationBuilder } from "@/components/automation-builder";
import { parseAttachments } from "@/lib/dm-attachments";

export default async function NewAutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user } = await requireAutomationAccess();

  const [{ data: account }, { data: fbPages }, { data: sourceAutomation }] =
    await Promise.all([
      supabase
        .from("instagram_accounts")
        .select("id, access_token, username")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("facebook_pages")
        .select("id, page_name, picture_url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      // Duplicating an existing automation? Prefill its campaign content.
      sp.from
        ? supabase
            .from("automations")
            .select(
              "name, keyword, dm_message, public_reply, dm_attachments, dm_button_label",
            )
            .eq("id", sp.from)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const pages = fbPages ?? [];

  if (!account && pages.length === 0) {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-lg font-bold text-ink">Connect a channel first</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
          You need a connected Instagram account or Facebook Page before
          creating automations.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <ConnectButton />
          <FacebookConnectButton />
        </div>
      </div>
    );
  }

  let media: IgMedia[] = [];
  let nextCursor: string | undefined;
  let loadError: string | null = null;
  if (account) {
    try {
      const page = await getMediaPage(account.access_token, 30);
      media = page.data;
      nextCursor = page.after;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Failed to load posts";
    }
  }

  // Which posts already have an automation?
  const [igExisting, fbExisting] = await Promise.all([
    account
      ? supabase
          .from("automations")
          .select("ig_media_id")
          .eq("account_id", account.id)
      : Promise.resolve({ data: [] as { ig_media_id: string }[] }),
    pages.length > 0
      ? supabase
          .from("automations")
          .select("ig_media_id")
          .eq("user_id", user.id)
          .eq("platform", "facebook")
      : Promise.resolve({ data: [] as { ig_media_id: string }[] }),
  ]);
  const usedMediaIds = (igExisting.data ?? []).map((e) => e.ig_media_id);
  const usedFbPostIds = (fbExisting.data ?? []).map((e) => e.ig_media_id);

  const initialValues = sourceAutomation
    ? {
        name: sourceAutomation.name
          ? `${sourceAutomation.name} (copy)`
          : undefined,
        keyword: sourceAutomation.keyword ?? undefined,
        dmMessage: sourceAutomation.dm_message ?? undefined,
        publicReply: sourceAutomation.public_reply ?? undefined,
        dmAttachments: parseAttachments(sourceAutomation.dm_attachments),
        dmButtonLabel: sourceAutomation.dm_button_label ?? undefined,
      }
    : undefined;

  const subtitle = sourceAutomation
    ? "Campaign content copied — just pick the posts to run it on."
    : account
      ? pages.length > 0
        ? `Pick posts from @${account.username} or your Facebook Pages, then write the DM.`
        : `Pick a post from @${account.username}, then write the DM.`
      : "Pick posts from your Facebook Pages, then write the DM.";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/automations"
          className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:bg-white/60 hover:text-ink cursor-pointer"
        >
          ← Back
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            New automation
          </h1>
          <p className="text-sm text-ink-soft">{subtitle}</p>
        </div>
      </div>

      {loadError && pages.length === 0 ? (
        <div className="glass-strong rounded-3xl p-8 text-center">
          <p className="text-sm font-medium text-red-700">
            Couldn&apos;t load your posts: {loadError}
          </p>
          <p className="mt-2 text-xs text-ink-soft">
            Try reconnecting your Instagram account.
          </p>
        </div>
      ) : (
        <>
          {loadError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              Couldn&apos;t load your Instagram posts: {loadError}. Facebook
              posts are still available below.
            </div>
          )}
          <AutomationBuilder
            instagram={
              account && !loadError
                ? {
                    accountId: account.id,
                    media,
                    nextCursor,
                    usedMediaIds,
                  }
                : undefined
            }
            facebook={
              pages.length > 0
                ? {
                    pages: pages.map((p) => ({
                      id: p.id,
                      name: p.page_name ?? "Facebook Page",
                      pictureUrl: p.picture_url,
                    })),
                    usedPostIds: usedFbPostIds,
                  }
                : undefined
            }
            initialValues={initialValues}
          />
        </>
      )}
    </div>
  );
}
