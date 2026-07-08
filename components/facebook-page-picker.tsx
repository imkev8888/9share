"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, FacebookIcon } from "@/components/icons";

export interface PickablePage {
  id: string;
  name: string;
  pictureUrl: string | null;
  alreadyConnected: boolean;
}

export function FacebookPagePicker({ pages }: { pages: PickablePage[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const selectable = pages.filter((p) => !p.alreadyConnected);
  // Pre-check when the user manages exactly one connectable Page.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(selectable.length === 1 ? [selectable[0].id] : []),
  );
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function connect() {
    if (selected.size === 0) {
      setError("Pick at least one Page.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/facebook/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageIds: Array.from(selected) }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not connect the selected Pages.");
          return;
        }
        router.push("/dashboard/channels?connect=facebook_success");
        router.refresh();
      } catch {
        setError("Could not connect the selected Pages. Please try again.");
      }
    });
  }

  return (
    <div className="glass-strong rounded-3xl p-5 sm:p-6">
      <ul className="divide-y divide-white/60">
        {pages.map((page) => {
          const isSel = selected.has(page.id);
          const disabled = page.alreadyConnected;
          return (
            <li key={page.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(page.id)}
                aria-pressed={isSel}
                className={`flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors duration-200 ${
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-white/60"
                }`}
              >
                {page.pictureUrl ? (
                  <Image
                    src={page.pictureUrl}
                    alt=""
                    width={44}
                    height={44}
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-white">
                    <FacebookIcon className="h-5 w-5" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{page.name}</p>
                  <p className="text-xs text-ink-soft">
                    {disabled ? "Already connected" : "Facebook Page"}
                  </p>
                </div>

                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
                    isSel
                      ? "border-[#1877F2] bg-[#1877F2] text-white"
                      : "border-brand-200 bg-white text-transparent"
                  }`}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={connect}
        disabled={pending || selected.size === 0}
        className="mt-4 w-full rounded-2xl bg-[#1877F2] py-3 font-bold text-white shadow-sm transition-opacity duration-200 hover:opacity-90 disabled:opacity-60 cursor-pointer"
      >
        {pending
          ? "Connecting…"
          : selected.size > 1
            ? `Connect ${selected.size} Pages`
            : "Connect"}
      </button>
    </div>
  );
}
