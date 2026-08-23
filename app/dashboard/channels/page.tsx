import { requireAnyProductAccess } from "@/lib/product-gate";
import { ConnectButton } from "@/components/connect-button";
import { FacebookConnectButton } from "@/components/facebook-connect-button";
import { ThreadsConnectButton } from "@/components/threads-connect-button";
import { LinkedInConnectButton } from "@/components/linkedin-connect-button";
import { ChannelDisconnectButton } from "@/components/channel-disconnect-button";
import { ChannelReconnectButton } from "@/components/channel-reconnect-button";
import { RedNoteChannelCard } from "@/components/rednote-channel-card";
import { WeChatChannelCard } from "@/components/wechat-channel-card";
import {
  CheckIcon,
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/icons";
import { MediaThumb } from "@/components/media-thumb";

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; reason?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user } = await requireAnyProductAccess();

  const [
    { data: igAccount },
    { data: fbPages },
    { data: threadsAccount },
    { data: linkedinAccount },
  ] = await Promise.all([
    supabase
      .from("instagram_accounts")
      .select("id, username, name, profile_picture_url")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("facebook_pages")
      .select("id, page_id, page_name, picture_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("threads_accounts")
      .select("id, username, name")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("linkedin_accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const pages = fbPages ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Channels
        </h1>
        <p className="text-sm text-ink-soft">
          Connect the social accounts you want 9share to automate.
        </p>
      </div>

      {sp.connect === "facebook_success" && (
        <div className="flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800">
          <CheckIcon className="h-4 w-4" /> Facebook Page connected
          successfully.
        </div>
      )}
      {sp.connect === "threads_success" && (
        <div className="flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800">
          <CheckIcon className="h-4 w-4" /> Threads connected successfully.
        </div>
      )}
      {sp.connect === "linkedin_success" && (
        <div className="flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800">
          <CheckIcon className="h-4 w-4" /> LinkedIn connected successfully.
        </div>
      )}
      {sp.connect === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Couldn&apos;t connect: {sp.reason || "unknown error"}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Instagram */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="inline-flex rounded-2xl bg-gradient-to-br from-brand-500 to-[var(--color-cyan-cta)] p-2.5 text-white">
              <InstagramIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-ink">Instagram</h2>
              <p className="text-xs text-ink-soft">
                Comment-to-DM on posts and reels
              </p>
            </div>
          </div>

          {igAccount ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white/60 p-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-brand-600">
                <MediaThumb
                  src={igAccount.profile_picture_url}
                  alt={igAccount.username ?? "profile"}
                  className="h-full w-full object-cover"
                  fallbackClassName="flex h-full w-full items-center justify-center text-white"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-ink">
                    @{igAccount.username}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                    <CheckIcon className="h-3 w-3" /> Connected
                  </span>
                </div>
                <p className="truncate text-xs text-ink-soft">
                  {igAccount.name ?? "Instagram account"}
                </p>
              </div>
              <ChannelReconnectButton
                platform="instagram"
                name={`@${igAccount.username}`}
              />
              <ChannelDisconnectButton
                platform="instagram"
                id={igAccount.id}
                name={`@${igAccount.username}`}
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-white/60 p-4 text-center">
              <p className="mb-3 text-sm text-ink-soft">
                Requires an Instagram Business or Creator account.
              </p>
              <ConnectButton />
            </div>
          )}
        </div>

        {/* Facebook */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="inline-flex rounded-2xl bg-[#1877F2] p-2.5 text-white">
              <FacebookIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-ink">Facebook</h2>
              <p className="text-xs text-ink-soft">
                Comment-to-Messenger on Page posts
              </p>
            </div>
          </div>

          {pages.length > 0 ? (
            <div className="space-y-2">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center gap-3 rounded-2xl bg-white/60 p-3"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#1877F2]">
                    <MediaThumb
                      src={page.picture_url}
                      alt={page.page_name ?? "page"}
                      className="h-full w-full object-cover"
                      fallbackClassName="flex h-full w-full items-center justify-center text-white"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-ink">
                        {page.page_name ?? "Facebook Page"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                        <CheckIcon className="h-3 w-3" /> Connected
                      </span>
                    </div>
                    <p className="truncate text-xs text-ink-soft">
                      Facebook Page
                    </p>
                  </div>
                  <ChannelReconnectButton
                    platform="facebook"
                    name={page.page_name ?? "this Page"}
                  />
                  <ChannelDisconnectButton
                    platform="facebook"
                    id={page.id}
                    name={page.page_name ?? "this Page"}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white/60 p-4 text-center">
              <p className="mb-3 text-sm text-ink-soft">
                Connect a Facebook Page you manage — when someone comments on a
                post, 9share sends them a Messenger DM.
              </p>
              <FacebookConnectButton />
            </div>
          )}
        </div>

        {/* Threads */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="inline-flex rounded-2xl bg-ink p-2.5 text-white">
              <ThreadsIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-ink">Threads</h2>
              <p className="text-xs text-ink-soft">Cross-post to Threads</p>
            </div>
          </div>

          {threadsAccount ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white/60 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-ink">
                    @{threadsAccount.username ?? "threads"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                    <CheckIcon className="h-3 w-3" /> Connected
                  </span>
                </div>
                <p className="truncate text-xs text-ink-soft">
                  {threadsAccount.name ?? "Threads account"}
                </p>
              </div>
              <ChannelReconnectButton
                platform="threads"
                name={`@${threadsAccount.username ?? "threads"}`}
              />
              <ChannelDisconnectButton
                platform="threads"
                id={threadsAccount.id}
                name={`@${threadsAccount.username ?? "threads"}`}
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-white/60 p-4 text-center">
              <p className="mb-3 text-sm text-ink-soft">
                Connect your Threads profile for cross-posting.
              </p>
              <ThreadsConnectButton />
            </div>
          )}
        </div>

        {/* LinkedIn */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="inline-flex rounded-2xl bg-[#0A66C2] p-2.5 text-white">
              <LinkedInIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-ink">LinkedIn</h2>
              <p className="text-xs text-ink-soft">Cross-post to your profile</p>
            </div>
          </div>

          {linkedinAccount ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white/60 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-ink">
                    {linkedinAccount.name ?? "LinkedIn member"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                    <CheckIcon className="h-3 w-3" /> Connected
                  </span>
                </div>
                <p className="truncate text-xs text-ink-soft">LinkedIn profile</p>
              </div>
              <ChannelReconnectButton
                platform="linkedin"
                name={linkedinAccount.name ?? "LinkedIn"}
              />
              <ChannelDisconnectButton
                platform="linkedin"
                id={linkedinAccount.id}
                name={linkedinAccount.name ?? "LinkedIn"}
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-white/60 p-4 text-center">
              <p className="mb-3 text-sm text-ink-soft">
                Connect LinkedIn to publish posts from 9share.
              </p>
              <LinkedInConnectButton />
            </div>
          )}
        </div>

        <RedNoteChannelCard />
        <WeChatChannelCard />
      </div>
    </div>
  );
}
