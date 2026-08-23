"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshIcon, SendIcon, CheckIcon } from "@/components/icons";

interface Status {
  queue: {
    retryable: number;
    expired: number;
    permanent: number;
    alreadyMessaged: number;
  };
  recoveredRows: number;
  usage: {
    lastHour: number;
    lastDay: number;
    hourlyLimit: number;
    dailyLimit: number;
  };
  drip: {
    enabled: boolean;
    haltedReason: string | null;
    lastSendAt: string | null;
    nextSendAfter: string | null;
    blockedReason: string | null;
  };
  etaHours: number;
}

interface Pass {
  automationId: string;
  name: string;
  willSend: number;
  skipped: number;
  recorded: number;
  queued: number;
  postGone: boolean;
  error?: string;
  samples: { username: string | null; comment: string | null }[];
}

interface PassResult {
  swept: number;
  remainingPosts: number;
  applied: boolean;
  passes: Pass[];
}

/**
 * Window onto the background retry drip. Sending is driven by cron, so this
 * panel never sends anything itself — closing the page changes nothing.
 */
export function RetryFailedPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<PassResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/automations/retry-failed");
      if (!res.ok) return;
      setStatus((await res.json()) as Status);
    } catch {
      // A failed poll is not worth surfacing; the next one will catch up.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function act(action: string, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/automations/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (action === "preview" || action === "reconcile") {
        setPreview(data as PassResult);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (!status) return null;

  const { queue, usage, drip } = status;
  const nothingToDo =
    queue.retryable === 0 && queue.expired === 0 && queue.permanent === 0;
  if (nothingToDo && !drip.enabled) return null;

  return (
    <div className="glass rounded-3xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <RefreshIcon className="h-4 w-4 text-brand-600" />
            Retry failed auto-replies
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            {queue.retryable > 0 ? (
              <>
                <span className="font-semibold text-ink">
                  {queue.retryable}
                </span>{" "}
                comment{queue.retryable === 1 ? "" : "s"} never got their DM and
                can still be reached. Instagram only allows this within 7 days
                of the comment.
              </>
            ) : (
              "Nothing is waiting to be retried."
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void act("preview", "preview")}
            disabled={busy !== null}
            className="rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60 cursor-pointer"
          >
            {busy === "preview" ? "Checking…" : "Check first"}
          </button>
          {drip.enabled ? (
            <button
              type="button"
              onClick={() => void act("pause", "pause")}
              disabled={busy !== null}
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60 cursor-pointer"
            >
              {busy === "pause" ? "Pausing…" : "Pause"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void act("start", "start")}
              disabled={busy !== null || queue.retryable === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-cyan-cta)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
            >
              <SendIcon className="h-3.5 w-3.5" />
              {busy === "start" ? "Starting…" : "Start sending"}
            </button>
          )}
        </div>
      </div>

      {drip.haltedReason && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
          <p className="font-bold">Sending stopped automatically</p>
          <p className="mt-0.5">{drip.haltedReason}</p>
          <p className="mt-1 text-red-700">
            Nothing more will be sent until you press Start again.
          </p>
        </div>
      )}

      {drip.enabled && !drip.haltedReason && (
        <div className="mt-3 rounded-2xl bg-brand-50/70 px-3 py-2.5 text-xs text-ink-soft">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-brand-700">
              Sending in the background
            </span>
            <span>
              {usage.lastHour}/{usage.hourlyLimit} this hour
            </span>
            <span>
              {usage.lastDay}/{usage.dailyLimit} today
            </span>
            {status.etaHours > 0 && (
              <span>about {status.etaHours}h to finish</span>
            )}
          </div>
          <p className="mt-1">
            Paced like a person, roughly one message every one to two minutes.
            You can close this page — it keeps going.
          </p>
          {drip.blockedReason && (
            <p className="mt-1 text-amber-700">
              Currently waiting: {drip.blockedReason}.
            </p>
          )}
        </div>
      )}

      {(queue.expired > 0 ||
        queue.permanent > 0 ||
        queue.alreadyMessaged > 0) && (
        <ul className="mt-3 space-y-1 text-xs text-ink-soft">
          {queue.expired > 0 && (
            <li>
              {queue.expired} past Instagram&apos;s 7-day window — these can no
              longer be messaged by anyone.
            </li>
          )}
          {queue.permanent > 0 && (
            <li>
              {queue.permanent} can&apos;t be delivered (comment or account
              gone).
            </li>
          )}
          {queue.alreadyMessaged > 0 && (
            <li>
              {queue.alreadyMessaged} already received a DM for that post.
            </li>
          )}
        </ul>
      )}

      {status.recoveredRows > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-cyan-700">
          <CheckIcon className="h-3.5 w-3.5" />
          {status.recoveredRows} record
          {status.recoveredRows === 1 ? "" : "s"} rebuilt for comments the
          database restore lost.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      {preview && (
        <div className="mt-3 rounded-2xl border border-white/70 bg-white/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-ink">
              {preview.applied ? "Applied" : "Dry run"} — checked{" "}
              {preview.swept} post{preview.swept === 1 ? "" : "s"}
            </p>
            {preview.remainingPosts > 0 && (
              <button
                type="button"
                onClick={() => void act("preview", "preview")}
                disabled={busy !== null}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-60 cursor-pointer"
              >
                Check {preview.remainingPosts} more
              </button>
            )}
          </div>

          <div className="mt-2 space-y-2">
            {preview.passes.map((pass) => (
              <div key={pass.automationId} className="text-xs">
                <p className="truncate font-semibold text-ink">{pass.name}</p>
                <p className="text-ink-soft">
                  {pass.postGone
                    ? "post deleted on Instagram"
                    : [
                        `${pass.willSend} to send`,
                        pass.skipped > 0 && `${pass.skipped} already handled`,
                        pass.recorded > 0 && `${pass.recorded} re-recorded`,
                        pass.queued > 0 && `${pass.queued} missed comment(s)`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
                {pass.samples.length > 0 && (
                  <p className="mt-0.5 truncate text-ink-soft/80">
                    e.g. {pass.samples.map((s) => `@${s.username}`).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!preview.applied && (
            <button
              type="button"
              onClick={() => void act("reconcile", "reconcile")}
              disabled={busy !== null}
              className="mt-3 rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60 cursor-pointer"
            >
              {busy === "reconcile"
                ? "Updating…"
                : "Apply — tidy up records, send nothing"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
