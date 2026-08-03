"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, FacebookIcon } from "@/components/icons";
import { MediaThumb } from "@/components/media-thumb";

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
  // One account can link exactly one Facebook Page. Pre-select when there's
  // only one connectable Page.
  const [selected, setSelected] = useState<string | null>(
    () => (selectable.length === 1 ? selectable[0].id : null),
  );
  const [error, setError] = useState<string | null>(null);

  function pick(id: string) {
    setError(null);
    setSelected((prev) => (prev === id ? null : id));
  }

  function connect() {
    if (!selected) {
      setError("Pick a Page.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/facebook/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageIds: [selected] }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not connect the selected Page.");
          return;
        }
        router.push("/dashboard/channels?connect=facebook_success");
        router.refresh();
      } catch {
        setError("Could not connect the selected Page. Please try again.");
      }
    });
  }

  return (
    <div className="glass-strong rounded-3xl p-5 sm:p-6">
      <ul className="divide-y divide-white/60">
        {pages.map((page) => {
          const isSel = selected === page.id;
          const disabled = page.alreadyConnected;
          return (
            <li key={page.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => pick(page.id)}
                aria-pressed={isSel}
                className={`flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors duration-200 ${
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-white/60"
                }`}
              >
                {page.pictureUrl ? (
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#1877F2]">
                    <MediaThumb
                      src={page.pictureUrl}
                      className="h-full w-full object-cover"
                    />
                  </div>
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
        disabled={pending || !selected}
        className="mt-4 w-full rounded-2xl bg-[#1877F2] py-3 font-bold text-white shadow-sm transition-opacity duration-200 hover:opacity-90 disabled:opacity-60 cursor-pointer"
      >
        {pending ? "Connecting…" : "Connect"}
      </button>
    </div>
  );
}
