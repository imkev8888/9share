"use client";

import { useEffect, useState } from "react";
import type { CrossPostPlatform, TargetStatus } from "@/lib/cross-post/types";
import { ExternalLinkIcon } from "@/components/icons";

const PLATFORM_LABELS: Record<CrossPostPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  linkedin: "LinkedIn",
  rednote: "RedNote",
  wechat: "WeChat Moments",
};

const TERMINAL: TargetStatus[] = ["success", "failed", "skipped"];

interface TargetRow {
  id: string;
  platform: string;
  status: TargetStatus;
  progress: number;
  error: string | null;
  permalink: string | null;
}

interface PostDetail {
  id: string;
  status: string;
  cross_post_targets: TargetRow[];
}

export function CrossPostProgress({
  postId,
  onDone,
}: {
  postId: string;
  onDone?: () => void;
}) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/cross-post/${postId}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Failed to load status");
          return;
        }
        if (!cancelled) {
          setPost(data);
          setError(null);
        }

        const targets = (data.cross_post_targets ?? []) as TargetRow[];
        const allDone =
          targets.length > 0 &&
          targets.every((t) => TERMINAL.includes(t.status));

        if (allDone) {
          onDone?.();
          return;
        }

        timer = setTimeout(poll, 1500);
      } catch {
        if (!cancelled) setError("Network error");
        timer = setTimeout(poll, 1500);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [postId, onDone]);

  const targets = post?.cross_post_targets ?? [];

  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold text-ink">Publishing progress</h3>
        {post?.status && (
          <span className="rounded-full bg-white/60 px-2.5 py-0.5 text-xs font-semibold capitalize text-ink-soft">
            {post.status}
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {targets.map((t) => {
          const label =
            PLATFORM_LABELS[t.platform as CrossPostPlatform] ?? t.platform;
          const done = TERMINAL.includes(t.status);

          return (
            <div key={t.id} className="rounded-2xl bg-white/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">{label}</span>
                <span
                  className={`text-xs font-semibold capitalize ${
                    t.status === "success"
                      ? "text-cyan-700"
                      : t.status === "failed"
                        ? "text-red-600"
                        : t.status === "skipped"
                          ? "text-amber-700"
                          : "text-ink-soft"
                  }`}
                >
                  {t.status}
                </span>
              </div>

              <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-[var(--color-cyan-cta)] transition-all duration-500"
                  style={{ width: `${Math.min(100, t.progress)}%` }}
                />
              </div>

              {t.error && (
                <p className="mt-1 text-xs text-red-600">{t.error}</p>
              )}

              {t.permalink && (
                <a
                  href={t.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                >
                  View post
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              )}

              {!done && (
                <p className="mt-1 text-[11px] text-ink-soft">
                  {t.progress}% complete
                </p>
              )}
            </div>
          );
        })}

        {targets.length === 0 && !error && (
          <p className="text-sm text-ink-soft">Loading targets…</p>
        )}
      </div>
    </div>
  );
}
