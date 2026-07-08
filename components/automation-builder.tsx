"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCampaign } from "@/app/dashboard/actions";
import type { IgMedia } from "@/lib/instagram";
import type { FbPost } from "@/lib/facebook";
import {
  CheckIcon,
  FacebookIcon,
  InstagramIcon,
  MessageIcon,
  SparkIcon,
} from "@/components/icons";

const TEMPLATES = [
  {
    label: "Send a link",
    text: "Hey {{username}}! 💌 Thanks for the love — here's the link you asked for: \n\nyourlink.com\n\nLet me know if you have any questions! 🌸",
  },
  {
    label: "Discount code",
    text: "Hi {{username}}! 🎉 As promised, here's your exclusive 20% off code: SAVE20\n\nShop now → yourstore.com",
  },
  {
    label: "Lead magnet",
    text: "Hey {{username}}! 📩 Here's your free guide — hope you love it: \n\nyourlink.com/free-guide\n\nReply here if you'd like more tips!",
  },
];

type Platform = "instagram" | "facebook";

/** One selectable post, unified across channels. */
interface PickerItem {
  platform: Platform;
  id: string;
  thumb?: string | null;
  caption?: string | null;
  permalink?: string;
  /** facebook_pages row id (uuid) — facebook items only. */
  fbPageId?: string;
  productType?: string;
  mediaType?: string;
}

export interface InstagramChannelProps {
  accountId: string;
  media: IgMedia[];
  nextCursor?: string;
  usedMediaIds: string[];
}

export interface FacebookChannelProps {
  pages: { id: string; name: string; pictureUrl: string | null }[];
  usedPostIds: string[];
}

interface FbPostsState {
  items: PickerItem[];
  after?: string;
  loaded: boolean;
  loading: boolean;
  error?: string;
}

function igToItem(m: IgMedia): PickerItem {
  return {
    platform: "instagram",
    id: m.id,
    thumb: m.thumbnail_url ?? m.media_url,
    caption: m.caption,
    permalink: m.permalink,
    productType: m.media_product_type,
    mediaType: m.media_type,
  };
}

function fbToItem(p: FbPost, fbPageId: string): PickerItem {
  return {
    platform: "facebook",
    id: p.id,
    thumb: p.full_picture,
    caption: p.message,
    permalink: p.permalink_url,
    fbPageId,
  };
}

export interface BuilderInitialValues {
  name?: string;
  keyword?: string;
  dmMessage?: string;
  publicReply?: string;
}

export function AutomationBuilder({
  instagram,
  facebook,
  initialValues,
}: {
  instagram?: InstagramChannelProps;
  facebook?: FacebookChannelProps;
  /** Prefill campaign content, e.g. when duplicating an automation. */
  initialValues?: BuilderInitialValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const igConnected = !!instagram;
  const fbConnected = !!facebook && facebook.pages.length > 0;

  const usedIg = new Set(instagram?.usedMediaIds ?? []);
  const usedFb = new Set(facebook?.usedPostIds ?? []);

  const [channel, setChannel] = useState<Platform>(
    igConnected ? "instagram" : "facebook",
  );

  // Instagram picker state (server-prefetched).
  const [igItems, setIgItems] = useState<PickerItem[]>(
    (instagram?.media ?? []).map(igToItem),
  );
  const [igCursor, setIgCursor] = useState(instagram?.nextCursor);
  const [igLoadingMore, setIgLoadingMore] = useState(false);

  // Facebook picker state (lazy-loaded per Page).
  const [fbPageId, setFbPageId] = useState<string>(
    facebook?.pages[0]?.id ?? "",
  );
  const [fbPosts, setFbPosts] = useState<Record<string, FbPostsState>>({});

  const [selected, setSelected] = useState<PickerItem[]>([]);
  const [name, setName] = useState(initialValues?.name ?? "");
  // Prefilled names (from duplication) shouldn't be overwritten by the
  // caption-based smart default.
  const [nameEdited, setNameEdited] = useState(!!initialValues?.name);
  const [keyword, setKeyword] = useState(initialValues?.keyword ?? "");
  const [dmMessage, setDmMessage] = useState(initialValues?.dmMessage ?? "");
  const [publicReply, setPublicReply] = useState(
    initialValues?.publicReply ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const selectedIds = new Set(selected.map((m) => m.id));

  const loadFbPosts = useCallback(
    async (pageId: string, after?: string) => {
      setFbPosts((prev) => ({
        ...prev,
        [pageId]: {
          items: prev[pageId]?.items ?? [],
          after: prev[pageId]?.after,
          loaded: prev[pageId]?.loaded ?? false,
          loading: true,
        },
      }));
      try {
        const params = new URLSearchParams({ pageId });
        if (after) params.set("after", after);
        const res = await fetch(`/api/facebook/posts?${params.toString()}`);
        const page = await res.json();
        if (!res.ok) throw new Error(page.error || "Failed to load posts.");

        const fresh = (page.data as FbPost[]).map((p) => fbToItem(p, pageId));
        setFbPosts((prev) => {
          const current = prev[pageId]?.items ?? [];
          const existing = new Set(current.map((i) => i.id));
          return {
            ...prev,
            [pageId]: {
              items: [...current, ...fresh.filter((i) => !existing.has(i.id))],
              after: page.after,
              loaded: true,
              loading: false,
            },
          };
        });
      } catch (e) {
        setFbPosts((prev) => ({
          ...prev,
          [pageId]: {
            items: prev[pageId]?.items ?? [],
            after: prev[pageId]?.after,
            loaded: true,
            loading: false,
            error: e instanceof Error ? e.message : "Failed to load posts.",
          },
        }));
      }
    },
    [],
  );

  // Fetch a Page's posts the first time it's shown in the Facebook tab.
  useEffect(() => {
    if (channel !== "facebook" || !fbPageId) return;
    const state = fbPosts[fbPageId];
    if (!state?.loaded && !state?.loading) loadFbPosts(fbPageId);
  }, [channel, fbPageId, fbPosts, loadFbPosts]);

  function isUsed(item: PickerItem) {
    return item.platform === "instagram"
      ? usedIg.has(item.id)
      : usedFb.has(item.id);
  }

  function pick(item: PickerItem) {
    if (isUsed(item)) return;
    setError(null);

    const next = selectedIds.has(item.id)
      ? selected.filter((s) => s.id !== item.id)
      : [...selected, item];
    setSelected(next);

    // Smart default name: a single selection uses its caption; multiple
    // selections leave it blank so each post keeps its own caption-based name.
    if (!nameEdited) {
      setName(next.length === 1 ? formatCampaignName(next[0]) : "");
    }
  }

  function clearSelection() {
    setSelected([]);
    if (!nameEdited) setName("");
  }

  function save() {
    setError(null);
    if (selected.length === 0) return setError("Pick at least one post or reel.");
    if (!dmMessage.trim()) return setError("Write the DM message.");

    const igSelected = selected.filter((s) => s.platform === "instagram");
    const fbSelected = selected.filter((s) => s.platform === "facebook");

    startTransition(async () => {
      try {
        const res = await createCampaign({
          name,
          keyword,
          dmMessage,
          publicReply,
          instagram:
            igSelected.length > 0 && instagram
              ? {
                  accountId: instagram.accountId,
                  media: igSelected.map((m) => ({
                    igMediaId: m.id,
                    mediaPermalink: m.permalink,
                    mediaThumbnail: m.thumb ?? undefined,
                    mediaCaption: m.caption ?? undefined,
                  })),
                }
              : undefined,
          facebook:
            fbSelected.length > 0
              ? {
                  posts: fbSelected.map((p) => ({
                    pageId: p.fbPageId!,
                    postId: p.id,
                    permalink: p.permalink,
                    thumbnail: p.thumb ?? undefined,
                    caption: p.caption ?? undefined,
                  })),
                }
              : undefined,
        });
        if (res?.error) setError(res.error);
        else router.push("/dashboard/automations");
      } catch {
        setError("Could not save these automations. Please try again.");
      }
    });
  }

  async function loadMoreIg() {
    if (!igCursor || igLoadingMore || !instagram) return;
    setIgLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        accountId: instagram.accountId,
        after: igCursor,
      });
      const res = await fetch(`/api/instagram/media?${params.toString()}`);
      const page = await res.json();

      if (!res.ok) {
        throw new Error(page.error || "Failed to load more posts.");
      }

      setIgItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        const fresh = (page.data as IgMedia[])
          .map(igToItem)
          .filter((item) => !existing.has(item.id));
        return [...current, ...fresh];
      });
      setIgCursor(page.after);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more posts.");
    } finally {
      setIgLoadingMore(false);
    }
  }

  const fbState: FbPostsState | undefined = fbPosts[fbPageId];
  const gridItems = channel === "instagram" ? igItems : (fbState?.items ?? []);

  const previewName = channel === "facebook" ? "Maria G." : "@maria_g";
  const preview = dmMessage.replaceAll("{{username}}", previewName);
  const count = selected.length;
  const fbSelectedCount = selected.filter(
    (s) => s.platform === "facebook",
  ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Step 1: pick posts */}
      <div className="lg:col-span-3 space-y-4">
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                1
              </span>
              <div>
                <h2 className="font-bold text-ink">Choose posts or reels</h2>
                <p className="text-xs text-ink-soft">
                  Select one or more — you can mix channels. Greyed-out posts
                  already have an automation.
                </p>
              </div>
            </div>
            {count > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors duration-200 hover:bg-white/60 hover:text-ink cursor-pointer"
              >
                Clear ({count})
              </button>
            )}
          </div>

          {/* Channel tabs */}
          <div className="mb-4 flex gap-2">
            <ChannelTab
              active={channel === "instagram"}
              connected={igConnected}
              onClick={() => setChannel("instagram")}
              icon={<InstagramIcon className="h-4 w-4" />}
              label="Instagram"
              selectedCount={count - fbSelectedCount}
            />
            <ChannelTab
              active={channel === "facebook"}
              connected={fbConnected}
              onClick={() => setChannel("facebook")}
              icon={<FacebookIcon className="h-4 w-4" />}
              label="Facebook"
              selectedCount={fbSelectedCount}
            />
          </div>

          {/* Facebook Page selector (when the user manages several Pages) */}
          {channel === "facebook" && facebook && facebook.pages.length > 1 && (
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold text-ink-soft">
                Facebook Page
              </label>
              <select
                value={fbPageId}
                onChange={(e) => setFbPageId(e.target.value)}
                className="input cursor-pointer"
              >
                {facebook.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {channel === "facebook" && fbState?.error ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-red-700">
                Couldn&apos;t load Page posts: {fbState.error}
              </p>
              <button
                type="button"
                onClick={() => loadFbPosts(fbPageId)}
                className="mt-3 rounded-2xl border border-brand-200 bg-white px-5 py-2 text-sm font-bold text-brand-600 transition-colors duration-200 hover:bg-brand-50 cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : channel === "facebook" && fbState?.loading && !fbState.loaded ? (
            <p className="py-8 text-center text-sm text-ink-soft">
              Loading Page posts…
            </p>
          ) : gridItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">
              No posts found on this {channel === "instagram" ? "account" : "Page"} yet.
            </p>
          ) : (
            <>
              <div className="grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {gridItems.map((m) => {
                  const isSel = selectedIds.has(m.id);
                  const used = isUsed(m);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={used}
                      onClick={() => pick(m)}
                      className={`group relative h-28 overflow-hidden rounded-xl border-2 bg-brand-50 transition-colors duration-200 sm:aspect-square sm:h-auto ${
                        used
                          ? "cursor-not-allowed border-transparent opacity-35 grayscale"
                          : "cursor-pointer"
                      } ${isSel ? "border-brand-500" : "border-transparent"}`}
                      aria-pressed={isSel}
                      aria-label={
                        used
                          ? "This post already has an automation"
                          : "Select this post"
                      }
                    >
                      {m.thumb ? (
                        <Image
                          src={m.thumb}
                          alt={m.caption?.slice(0, 30) ?? "post"}
                          fill
                          sizes="120px"
                          className="object-cover object-center"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-brand-100 p-2 text-brand-400">
                          <MessageIcon className="h-6 w-6 shrink-0" />
                          {m.caption && (
                            <span className="line-clamp-2 text-center text-[10px] leading-tight text-brand-500">
                              {m.caption}
                            </span>
                          )}
                        </div>
                      )}
                      {isSel && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                          <CheckIcon className="h-3 w-3" />
                        </span>
                      )}
                      {used && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-center text-[10px] font-semibold text-white">
                          Already used
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex justify-center">
                {channel === "instagram" ? (
                  igCursor ? (
                    <button
                      type="button"
                      onClick={loadMoreIg}
                      disabled={igLoadingMore}
                      className="rounded-2xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-bold text-brand-600 transition-colors duration-200 hover:bg-brand-50 disabled:opacity-60 cursor-pointer"
                    >
                      {igLoadingMore ? "Loading more…" : "Load more posts"}
                    </button>
                  ) : (
                    <p className="text-xs font-medium text-ink-soft">
                      All available posts loaded.
                    </p>
                  )
                ) : fbState?.after ? (
                  <button
                    type="button"
                    onClick={() => loadFbPosts(fbPageId, fbState.after)}
                    disabled={fbState.loading}
                    className="rounded-2xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-bold text-brand-600 transition-colors duration-200 hover:bg-brand-50 disabled:opacity-60 cursor-pointer"
                  >
                    {fbState.loading ? "Loading more…" : "Load more posts"}
                  </button>
                ) : (
                  <p className="text-xs font-medium text-ink-soft">
                    All available posts loaded.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Step 2: configure */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
              2
            </span>
            <div>
              <h2 className="font-bold text-ink">Set up the campaign</h2>
              {count > 1 && (
                <p className="text-xs text-ink-soft">
                  These settings apply to all {count} selected posts.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Field
              label="Campaign name"
              hint={
                count > 1
                  ? "Leave empty to name each campaign from its own caption."
                  : undefined
              }
            >
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                placeholder={
                  count > 1 ? "Optional shared name" : "Spring sale — Reel #3"
                }
                className="input"
              />
            </Field>

            <Field
              label="Trigger keyword (optional)"
              hint="Separate multiple triggers with commas. Leave empty to DM everyone."
            >
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. pm, dm, price"
                className="input"
              />
            </Field>

            <Field label="DM message">
              <div className="mb-2 flex flex-wrap gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setDmMessage(t.text)}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-600 transition-colors duration-200 hover:bg-brand-50 cursor-pointer"
                  >
                    <SparkIcon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                value={dmMessage}
                onChange={(e) => setDmMessage(e.target.value)}
                rows={6}
                placeholder="Hey {{username}}! Here's the link you asked for…"
                className="input resize-none"
              />
              <p className="mt-1 text-xs text-ink-soft">
                Use{" "}
                <code className="rounded bg-brand-50 px-1 text-brand-600">
                  {"{{username}}"}
                </code>{" "}
                to mention the commenter.
              </p>
              {fbSelectedCount > 0 && (
                <p className="mt-1 text-xs text-ink-soft">
                  Facebook allows one automatic message per comment.
                </p>
              )}
            </Field>

            <Field
              label="Public reply (optional)"
              hint="Posted under the comment, e.g. “Check your DMs! 💌”"
            >
              <input
                value={publicReply}
                onChange={(e) => setPublicReply(e.target.value)}
                placeholder="Just sent you a DM! 💌"
                className="input"
              />
            </Field>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="w-full rounded-2xl bg-[var(--color-cyan-cta)] py-3 font-bold text-white shadow-sm transition-colors duration-200 hover:bg-[var(--color-cyan-cta-dark)] disabled:opacity-60 cursor-pointer"
            >
              {pending
                ? "Saving…"
                : count > 1
                  ? `Activate ${count} automations`
                  : "Activate automation"}
            </button>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:col-span-2">
        <div className="glass-strong sticky top-6 rounded-3xl p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Live preview</h3>

          {count === 0 ? (
            <p className="mb-4 rounded-2xl bg-brand-50 p-3 text-xs text-ink-soft">
              Pick one or more posts to see them here.
            </p>
          ) : (
            <div className="mb-4 rounded-2xl bg-brand-50 p-3">
              <p className="mb-2 text-xs font-semibold text-ink">
                {count} {count === 1 ? "post" : "posts"} selected
              </p>
              <div className="flex flex-wrap gap-2">
                {selected.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg"
                  >
                    {m.thumb ? (
                      <Image
                        src={m.thumb}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-brand-100 text-brand-400">
                        <MessageIcon className="h-4 w-4" />
                      </div>
                    )}
                    <span
                      className={`absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-tl-md text-white ${
                        m.platform === "facebook"
                          ? "bg-[#1877F2]"
                          : "bg-gradient-to-br from-brand-400 to-brand-600"
                      }`}
                    >
                      {m.platform === "facebook" ? (
                        <FacebookIcon className="h-2.5 w-2.5" />
                      ) : (
                        <InstagramIcon className="h-2.5 w-2.5" />
                      )}
                    </span>
                  </div>
                ))}
                {count > 8 && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-600">
                    +{count - 8}
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            className={`rounded-2xl p-4 ${
              channel === "facebook"
                ? "bg-gradient-to-br from-white to-blue-50"
                : "bg-gradient-to-br from-white to-brand-50"
            }`}
          >
            <div className="flex items-start gap-2">
              <div
                className={`h-8 w-8 shrink-0 rounded-full ${
                  channel === "facebook"
                    ? "bg-gradient-to-br from-blue-400 to-[#1877F2]"
                    : "bg-gradient-to-br from-brand-400 to-brand-600"
                }`}
              />
              <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs shadow-sm">
                <span className="font-semibold text-ink">{previewName}</span>{" "}
                <span className="text-ink-soft">
                  {keyword ? keyword : "Love this!"}
                </span>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm px-3 py-2 text-xs text-white shadow-md ${
                  channel === "facebook"
                    ? "bg-[#1877F2]"
                    : "bg-gradient-to-br from-brand-500 to-[var(--color-cyan-cta)]"
                }`}
              >
                {preview || "Your DM will appear here…"}
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
              {channel === "facebook" ? "Messenger" : "Instagram DM"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelTab({
  active,
  connected,
  onClick,
  icon,
  label,
  selectedCount,
}: {
  active: boolean;
  connected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  selectedCount: number;
}) {
  if (!connected) {
    return (
      <span className="inline-flex items-center gap-2 rounded-2xl border border-brand-100 bg-white/50 px-4 py-2 text-sm font-semibold text-ink-soft/70">
        {icon}
        {label}
        <Link
          href="/dashboard/channels"
          className="text-xs font-bold text-brand-600 underline-offset-2 hover:underline cursor-pointer"
        >
          Connect
        </Link>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition-colors duration-200 cursor-pointer ${
        active
          ? "bg-brand-500 text-white shadow-sm"
          : "border border-brand-200 bg-white text-ink-soft hover:bg-brand-50 hover:text-ink"
      }`}
      aria-pressed={active}
    >
      {icon}
      {label}
      {selectedCount > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
            active ? "bg-white/25 text-white" : "bg-brand-100 text-brand-600"
          }`}
        >
          {selectedCount}
        </span>
      )}
    </button>
  );
}

function formatCampaignName(item: PickerItem) {
  const caption = item.caption?.replace(/\s+/g, " ").trim();
  if (caption) return caption.length > 40 ? `${caption.slice(0, 40)}…` : caption;

  const type =
    item.productType === "REELS"
      ? "Reel"
      : item.mediaType === "VIDEO"
        ? "Video"
        : "Post";

  return `${type} campaign`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}
