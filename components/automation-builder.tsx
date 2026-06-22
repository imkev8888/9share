"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAutomation } from "@/app/dashboard/actions";
import type { IgMedia } from "@/lib/instagram";
import { CheckIcon, MessageIcon, SparkIcon } from "@/components/icons";

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

export function AutomationBuilder({
  accountId,
  media,
  usedMediaIds,
}: {
  accountId: string;
  media: IgMedia[];
  usedMediaIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const used = new Set(usedMediaIds);

  const [selected, setSelected] = useState<IgMedia | null>(null);
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [publicReply, setPublicReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  function pick(m: IgMedia) {
    setSelected(m);
    if (!name) {
      const caption = m.caption?.slice(0, 40) ?? "";
      setName(caption ? `${caption}…` : "New campaign");
    }
  }

  function save() {
    setError(null);
    if (!selected) return setError("Pick a post first.");
    if (!dmMessage.trim()) return setError("Write the DM message.");

    startTransition(async () => {
      const res = await createAutomation({
        accountId,
        igMediaId: selected.id,
        mediaPermalink: selected.permalink,
        mediaThumbnail: selected.thumbnail_url ?? selected.media_url,
        mediaCaption: selected.caption,
        name,
        keyword,
        dmMessage,
        publicReply,
      });
      if (res?.error) setError(res.error);
      else router.push("/dashboard/automations");
    });
  }

  const preview = dmMessage.replaceAll("{{username}}", "@maria_g");

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Step 1: pick post */}
      <div className="lg:col-span-3 space-y-4">
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
              1
            </span>
            <h2 className="font-bold text-ink">Choose a post or reel</h2>
          </div>

          {media.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">
              No posts found on this account yet.
            </p>
          ) : (
            <div className="grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {media.map((m) => {
                const thumb = m.thumbnail_url ?? m.media_url;
                const isSel = selected?.id === m.id;
                const isUsed = used.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m)}
                    className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-colors duration-200 cursor-pointer ${
                      isSel ? "border-brand-500" : "border-transparent"
                    }`}
                  >
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt={m.caption?.slice(0, 30) ?? "post"}
                        fill
                        sizes="120px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-brand-100 text-brand-400">
                        <MessageIcon className="h-6 w-6" />
                      </div>
                    )}
                    {isSel && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    )}
                    {isUsed && !isSel && (
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-semibold text-white">
                        has automation
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 2: configure */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
              2
            </span>
            <h2 className="font-bold text-ink">Set up the campaign</h2>
          </div>

          <div className="space-y-4">
            <Field label="Campaign name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spring sale — Reel #3"
                className="input"
              />
            </Field>

            <Field
              label="Trigger keyword (optional)"
              hint="Leave empty to DM everyone who comments."
            >
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. PRICE, LINK, ME"
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
              {pending ? "Saving…" : "Activate automation"}
            </button>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:col-span-2">
        <div className="glass-strong sticky top-6 rounded-3xl p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Live preview</h3>

          {selected ? (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                {(selected.thumbnail_url ?? selected.media_url) && (
                  <Image
                    src={selected.thumbnail_url ?? selected.media_url!}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </div>
              <p className="line-clamp-2 text-xs text-ink-soft">
                {selected.caption ?? "Selected post"}
              </p>
            </div>
          ) : (
            <p className="mb-4 rounded-2xl bg-brand-50 p-3 text-xs text-ink-soft">
              Pick a post to see it here.
            </p>
          )}

          <div className="rounded-2xl bg-gradient-to-br from-white to-brand-50 p-4">
            <div className="flex items-start gap-2">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600" />
              <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs shadow-sm">
                <span className="font-semibold text-ink">@maria_g</span>{" "}
                <span className="text-ink-soft">
                  {keyword ? keyword : "Love this!"}
                </span>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-gradient-to-br from-brand-500 to-[var(--color-cyan-cta)] px-3 py-2 text-xs text-white shadow-md">
                {preview || "Your DM will appear here…"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
