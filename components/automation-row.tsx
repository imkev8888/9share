"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  toggleAutomation,
  deleteAutomation,
  updateAutomation,
} from "@/app/dashboard/actions";
import {
  TrashIcon,
  MessageIcon,
  PencilIcon,
  CopyIcon,
} from "@/components/icons";
import { PlatformBadge } from "@/components/platform-badge";

interface Automation {
  id: string;
  name: string;
  keyword: string | null;
  dm_message: string;
  public_reply?: string | null;
  media_thumbnail: string | null;
  media_permalink: string | null;
  is_active: boolean;
  sent_count: number;
  platform?: string | null;
}

export function AutomationRow({ automation }: { automation: Automation }) {
  const [active, setActive] = useState(automation.is_active);
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  // Editable campaign content — kept locally so the row updates immediately.
  const [name, setName] = useState(automation.name);
  const [keyword, setKeyword] = useState(automation.keyword ?? "");
  const [dmMessage, setDmMessage] = useState(automation.dm_message);
  const [publicReply, setPublicReply] = useState(automation.public_reply ?? "");
  const [draft, setDraft] = useState({ name, keyword, dmMessage, publicReply });
  const [error, setError] = useState<string | null>(null);

  function onToggle() {
    const next = !active;
    setActive(next);
    startTransition(() => toggleAutomation(automation.id, next));
  }

  function onDelete() {
    if (!confirm("Delete this automation? This cannot be undone.")) return;
    setDeleting(true);
    startTransition(() => deleteAutomation(automation.id));
  }

  function openEditor() {
    setDraft({ name, keyword, dmMessage, publicReply });
    setError(null);
    setEditing(true);
  }

  function onSave() {
    setError(null);
    if (!draft.dmMessage.trim()) {
      setError("Write the DM message.");
      return;
    }
    startTransition(async () => {
      const res = await updateAutomation({
        id: automation.id,
        name: draft.name,
        keyword: draft.keyword,
        dmMessage: draft.dmMessage,
        publicReply: draft.publicReply,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setName(draft.name.trim() || "Untitled campaign");
      setKeyword(draft.keyword.trim());
      setDmMessage(draft.dmMessage.trim());
      setPublicReply(draft.publicReply.trim());
      setEditing(false);
    });
  }

  return (
    <div
      className={`glass rounded-3xl p-5 transition-opacity duration-200 ${
        deleting ? "opacity-40" : ""
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {automation.media_thumbnail ? (
            <Image
              src={automation.media_thumbnail}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-500">
              <MessageIcon className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-bold text-ink">{name}</p>
              <PlatformBadge platform={automation.platform} />
            </div>
            <p className="truncate text-sm text-ink-soft">
              {keyword ? (
                <>
                  Trigger:{" "}
                  <span className="font-semibold text-brand-600">
                    &ldquo;{keyword}&rdquo;
                  </span>
                </>
              ) : (
                "Trigger: any comment"
              )}
              {" · "}
              {automation.sent_count} sent
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {automation.media_permalink && (
            <a
              href={automation.media_permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline cursor-pointer"
            >
              View post
            </a>
          )}

          <button
            type="button"
            onClick={editing ? () => setEditing(false) : openEditor}
            disabled={pending}
            className={`rounded-xl p-2 transition-colors duration-200 cursor-pointer ${
              editing
                ? "bg-brand-500 text-white"
                : "text-ink-soft hover:bg-white/70 hover:text-ink"
            }`}
            aria-label="Edit automation"
            aria-expanded={editing}
          >
            <PencilIcon className="h-5 w-5" />
          </button>

          <Link
            href={`/dashboard/automations/new?from=${automation.id}`}
            className="rounded-xl p-2 text-ink-soft transition-colors duration-200 hover:bg-white/70 hover:text-ink cursor-pointer"
            aria-label="Duplicate automation"
            title="Duplicate — reuse this campaign's content on other posts"
          >
            <CopyIcon className="h-5 w-5" />
          </Link>

          <div className="flex items-center gap-2 rounded-full bg-white/70 px-2.5 py-1.5 ring-1 ring-brand-100">
            <span className="min-w-7 text-xs font-bold text-ink-soft">
              {active ? "On" : "Off"}
            </span>
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              role="switch"
              aria-checked={active}
              aria-label={active ? "Turn automation off" : "Turn automation on"}
              className={`relative h-7 w-14 shrink-0 rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-60 ${
                active ? "bg-[var(--color-cyan-cta)]" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  active ? "translate-x-7" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="rounded-xl p-2 text-ink-soft transition-colors duration-200 hover:bg-red-50 hover:text-red-600 cursor-pointer"
            aria-label="Delete automation"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Inline editor — works even while the automation is active. */}
      {editing && (
        <div className="mt-4 space-y-3 rounded-2xl bg-white/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Campaign name
              </label>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Trigger keyword (optional)
              </label>
              <input
                value={draft.keyword}
                onChange={(e) =>
                  setDraft({ ...draft, keyword: e.target.value })
                }
                placeholder="e.g. pm, dm, price"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              DM message
            </label>
            <textarea
              value={draft.dmMessage}
              onChange={(e) =>
                setDraft({ ...draft, dmMessage: e.target.value })
              }
              rows={4}
              className="input resize-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Public reply (optional)
            </label>
            <input
              value={draft.publicReply}
              onChange={(e) =>
                setDraft({ ...draft, publicReply: e.target.value })
              }
              placeholder="Just sent you a DM! 💌"
              className="input"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:bg-white/70 hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="rounded-xl bg-[var(--color-cyan-cta)] px-5 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-[var(--color-cyan-cta-dark)] disabled:opacity-60 cursor-pointer"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
