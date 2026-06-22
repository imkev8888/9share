"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { toggleAutomation, deleteAutomation } from "@/app/dashboard/actions";
import { TrashIcon, MessageIcon } from "@/components/icons";

interface Automation {
  id: string;
  name: string;
  keyword: string | null;
  dm_message: string;
  media_thumbnail: string | null;
  media_permalink: string | null;
  is_active: boolean;
  sent_count: number;
}

export function AutomationRow({ automation }: { automation: Automation }) {
  const [active, setActive] = useState(automation.is_active);
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

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

  return (
    <div
      className={`glass flex flex-col gap-4 rounded-3xl p-5 transition-opacity duration-200 sm:flex-row sm:items-center ${
        deleting ? "opacity-40" : ""
      }`}
    >
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
          <p className="truncate font-bold text-ink">{automation.name}</p>
          <p className="truncate text-sm text-ink-soft">
            {automation.keyword ? (
              <>
                Trigger:{" "}
                <span className="font-semibold text-brand-600">
                  &ldquo;{automation.keyword}&rdquo;
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
  );
}
