"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MediaThumb } from "@/components/media-thumb";
import {
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  RefreshIcon,
  SendIcon,
  StopIcon,
  WarningIcon,
} from "@/components/icons";

interface Row {
  id: string;
  username: string | null;
  comment: string | null;
  expiresAt: string;
  queued: boolean;
}

interface Payload {
  rows: Row[];
  queued: number;
  drip: {
    haltedReason: string | null;
    lastSendAt: string | null;
    nextSendAfter: string | null;
    blockedReason: string | null;
  };
}

/**
 * How long a queue may sit with nothing stopping it before we call it stalled.
 * Delivery is driven by a scheduled job, so if that job isn't running — no cron
 * on localhost, a misconfigured deployment — the queue would otherwise appear
 * to be working while silently going nowhere.
 */
const STALLED_AFTER_MS = 10 * 60 * 1000;

type RowState =
  | "idle"
  | "confirm"
  | "sending"
  | "sent"
  | "failed"
  /** Resolved by hand rather than by sending. */
  | "cleared";
type Notice = { tone: "ok" | "warn"; text: string } | null;

/**
 * Everything that never got its DM for one post, with a single deliberate
 * click per person or one click to hand the lot to the paced worker.
 *
 * These are real DMs to real people, so both paths ask for confirmation and
 * report back what actually happened. Bulk sending stays interruptible.
 *
 * Rendered through a portal: the cards behind it use `backdrop-filter`, which
 * makes them containing blocks for fixed positioning, so a dialog nested
 * inside one would be sized and clipped to the card instead of the viewport.
 */
export function FailedRecoveryDialog({
  automationId,
  name,
  thumbnail,
  accountId,
  mediaId,
  onClose,
}: {
  automationId: string;
  name: string;
  thumbnail: string | null;
  accountId?: string | null;
  mediaId?: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [busy, setBusy] = useState<
    null | "refresh" | "queue" | "stop" | "clear"
  >(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** Queue size when the current batch started, so progress has a denominator. */
  const batchTotal = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/automations/retry-failed?automationId=${automationId}`,
    );
    if (!res.ok) throw new Error("Couldn't load this post");
    const payload = (await res.json()) as Payload;
    setData(payload);
    if (payload.queued > batchTotal.current) batchTotal.current = payload.queued;
    return payload;
  }, [automationId]);

  useEffect(() => {
    setMounted(true);
    void load().catch((err: unknown) =>
      setNotice({
        tone: "warn",
        text: err instanceof Error ? err.message : "Couldn't load this post",
      }),
    );
  }, [load]);

  // Follow the worker while it drains, then fall quiet again.
  const draining = (data?.queued ?? 0) > 0;
  useEffect(() => {
    if (!draining) return;
    const id = setInterval(() => void load().catch(() => undefined), 15_000);
    return () => clearInterval(id);
  }, [draining, load]);

  // Good news should not need dismissing; problems stay until they're read.
  useEffect(() => {
    if (notice?.tone !== "ok") return;
    const id = setTimeout(() => setNotice(null), 5_000);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/automations/retry-failed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Something went wrong");
    return payload as { skipped?: string; added?: number; cleared?: number };
  }

  async function sendOne(row: Row) {
    setRowState((s) => ({ ...s, [row.id]: "sending" }));
    setNotice(null);
    const who = `@${row.username ?? "them"}`;
    try {
      const result = await post({ action: "send", logId: row.id });
      setRowState((s) => ({ ...s, [row.id]: "sent" }));
      setNotice(
        result.skipped
          ? { tone: "ok", text: `${who} was already answered, so nothing was sent.` }
          : { tone: "ok", text: `DM sent to ${who}.` },
      );
    } catch (err) {
      setRowState((s) => ({ ...s, [row.id]: "failed" }));
      setNotice({
        tone: "warn",
        text: `Couldn't message ${who}: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  }

  /** Clear one warning without sending: this person was already looked after. */
  async function dismissOne(row: Row) {
    setNotice(null);
    const who = `@${row.username ?? "them"}`;
    try {
      await post({ action: "dismiss", logIds: [row.id] });
      setRowState((s) => ({ ...s, [row.id]: "cleared" }));
      setNotice({ tone: "ok", text: `${who} marked as handled. Nothing sent.` });
    } catch (err) {
      setNotice({
        tone: "warn",
        text: err instanceof Error ? err.message : "Couldn't clear that one",
      });
    }
  }

  async function dismissAll() {
    setBusy("clear");
    setConfirmClear(false);
    setNotice(null);
    try {
      const result = await post({ action: "dismiss", automationId });
      await load();
      setNotice({
        tone: "ok",
        text: `${result.cleared ?? 0} marked as handled. Nothing was sent.`,
      });
    } catch (err) {
      setNotice({
        tone: "warn",
        text: err instanceof Error ? err.message : "Couldn't clear the warning",
      });
    } finally {
      setBusy(null);
    }
  }

  async function queueAll(count: number) {
    setBusy("queue");
    setConfirmAll(false);
    setNotice(null);
    try {
      const result = await post({ action: "queue", automationId });
      await load();
      setNotice({
        tone: "ok",
        text: `${result.added ?? count} queued. They'll go out roughly every 3 minutes — you can close this page.`,
      });
    } catch (err) {
      setNotice({
        tone: "warn",
        text: err instanceof Error ? err.message : "Couldn't start sending",
      });
    } finally {
      setBusy(null);
    }
  }

  async function stopAll() {
    setBusy("stop");
    setNotice(null);
    try {
      const result = await post({ action: "unqueue", automationId });
      batchTotal.current = 0;
      await load();
      setNotice({
        tone: "ok",
        text: `Stopped. ${result.cleared ?? 0} still waiting were not sent.`,
      });
    } catch (err) {
      setNotice({
        tone: "warn",
        text: err instanceof Error ? err.message : "Couldn't stop",
      });
    } finally {
      setBusy(null);
    }
  }

  async function recheck() {
    setBusy("refresh");
    setNotice(null);
    try {
      await post({ action: "reconcile", automationId });
      const fresh = await load();
      setNotice({
        tone: "ok",
        text: `Re-checked Instagram — ${fresh.rows.length} still need a DM.`,
      });
    } catch (err) {
      setNotice({
        tone: "warn",
        text: err instanceof Error ? err.message : "Couldn't re-check",
      });
    } finally {
      setBusy(null);
    }
  }

  const rows = data?.rows ?? [];
  const resolved = (id: string) =>
    rowState[id] === "sent" || rowState[id] === "cleared";
  const pendingRows = rows.filter((row) => !resolved(row.id));
  const pending = pendingRows.length;
  const soonest = pendingRows.reduce<string | null>(
    (min, row) => (!min || row.expiresAt < min ? row.expiresAt : min),
    null,
  );
  const delivered = Math.max(0, batchTotal.current - (data?.queued ?? 0));
  const halted = data?.drip.haltedReason ?? null;
  // Nothing is stopping it and yet nothing has moved: the worker isn't running.
  const stalled =
    draining &&
    !halted &&
    !data?.drip.blockedReason &&
    Date.now() - new Date(data?.drip.lastSendAt ?? 0).getTime() >
      STALLED_AFTER_MS;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Unsent replies for ${name}`}
      onClick={onClose}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="glass-strong flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl outline-none sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl lg:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag affordance, mobile sheet only */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-ink/15" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 border-b border-white/60 p-3 sm:gap-3 sm:p-4">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-brand-100">
            <MediaThumb src={thumbnail} accountId={accountId} mediaId={mediaId} />
          </div>

          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-sm font-extrabold text-red-700"
            title={`${pending} comment${pending === 1 ? "" : "s"} never received their DM`}
          >
            <WarningIcon className="h-4 w-4" />
            {pending}
          </span>

          {soonest && (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-ink-soft"
              title={`Instagram's 7-day window closes ${new Date(soonest).toLocaleString("en-US")}`}
            >
              <ClockIcon className="h-4 w-4" />
              {formatCountdown(soonest)}
            </span>
          )}

          <p className="ml-1 hidden min-w-0 flex-1 truncate text-xs text-ink-soft lg:block">
            {name}
          </p>

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
            <button
              type="button"
              onClick={() => void recheck()}
              disabled={busy !== null}
              title="Re-check Instagram and drop anyone you already answered"
              aria-label="Re-check Instagram and drop anyone you already answered"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50 cursor-pointer sm:h-9 sm:w-9"
            >
              <RefreshIcon
                className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-white/60 cursor-pointer sm:h-9 sm:w-9"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {halted && (
          <p
            className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-800"
            role="status"
          >
            <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Instagram made us stop: {halted}</span>
          </p>
        )}

        {stalled && (
          <p
            className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900"
            role="status"
          >
            <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Nothing has gone out for a while. Delivery runs on the deployed
              site, not locally — send individually below, or use the send
              buttons one at a time.
            </span>
          </p>
        )}

        {notice && (
          <p
            className={`flex items-start gap-2 border-b px-4 py-2.5 text-xs font-semibold ${
              notice.tone === "ok"
                ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
            role="status"
            aria-live="polite"
          >
            {notice.tone === "ok" ? (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </p>
        )}

        {/* Rows */}
        <div className="min-h-0 flex-1 divide-y divide-white/60 overflow-y-auto overscroll-contain">
          {!data ? (
            <p className="px-4 py-10 text-center text-xs text-ink-soft">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <CheckIcon className="h-7 w-7 text-cyan-600" />
              <p className="text-sm font-bold text-ink">Everyone was reached</p>
              <p className="max-w-xs text-xs text-ink-soft">
                Nothing on this post is still waiting for a DM.
              </p>
            </div>
          ) : (
            rows.map((row) => {
              const state = rowState[row.id] ?? "idle";
              return (
                <div
                  key={row.id}
                  className={`flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 ${
                    resolved(row.id) ? "opacity-55" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      @{row.username ?? "someone"}
                    </p>
                    <p className="truncate text-xs text-ink-soft">
                      {row.comment ?? "—"}
                    </p>
                  </div>

                  {state === "sent" || state === "cleared" ? (
                    <span
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-cyan-600 sm:h-9 sm:w-9"
                      title={state === "sent" ? "DM sent" : "Marked as handled"}
                      aria-label={
                        state === "sent" ? "DM sent" : "Marked as handled"
                      }
                    >
                      {state === "sent" ? (
                        <CheckIcon className="h-5 w-5" />
                      ) : (
                        <CheckCircleIcon className="h-5 w-5" />
                      )}
                    </span>
                  ) : state === "confirm" ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="pr-0.5 text-xs font-bold text-ink">
                        Send?
                      </span>
                      <button
                        type="button"
                        onClick={() => void sendOne(row)}
                        title={`Yes, send the DM to @${row.username ?? "them"}`}
                        aria-label={`Yes, send the DM to @${row.username ?? "them"}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-cyan-cta)] text-white transition-opacity hover:opacity-90 cursor-pointer sm:h-9 sm:w-9"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRowState((s) => ({ ...s, [row.id]: "idle" }))
                        }
                        title="No, don't send"
                        aria-label="No, don't send"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-brand-200 bg-white text-ink-soft transition-colors hover:bg-brand-50 cursor-pointer sm:h-9 sm:w-9"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {row.queued && (
                        <span
                          className="shrink-0 text-brand-500"
                          title="Waiting its turn in the queue"
                          aria-label="Waiting its turn in the queue"
                        >
                          <ClockIcon className="h-4 w-4" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void dismissOne(row)}
                        title={`Already handled @${row.username ?? "them"} — clear without sending`}
                        aria-label={`Already handled @${row.username ?? "them"} — clear without sending`}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-white/70 hover:text-cyan-700 cursor-pointer sm:h-9 sm:w-9"
                      >
                        <CheckCircleIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRowState((s) => ({ ...s, [row.id]: "confirm" }))
                        }
                        disabled={state === "sending" || !!halted}
                        title={`Send this DM to @${row.username ?? "them"} now`}
                        aria-label={`Send this DM to @${row.username ?? "them"} now`}
                        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 cursor-pointer sm:h-9 sm:w-9 ${
                          state === "failed"
                            ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                            : "border-brand-200 bg-white text-brand-600 hover:bg-brand-50"
                        }`}
                      >
                        <SendIcon
                          className={`h-4 w-4 ${state === "sending" ? "animate-pulse" : ""}`}
                        />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {pending > 0 && (
          <div className="border-t border-white/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
            {draining ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-ink">
                    Sending {delivered}/{batchTotal.current}
                    <span className="ml-1.5 font-medium text-ink-soft">
                      about {formatEta(pending)} left
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void stopAll()}
                    disabled={busy !== null}
                    title="Stop sending — anything not yet delivered stays here"
                    aria-label="Stop sending — anything not yet delivered stays here"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-extrabold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60 cursor-pointer"
                  >
                    <StopIcon className="h-3.5 w-3.5" />
                    Stop
                  </button>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-white/70"
                  role="progressbar"
                  aria-valuenow={delivered}
                  aria-valuemin={0}
                  aria-valuemax={batchTotal.current}
                >
                  <div
                    className="h-full rounded-full bg-[var(--color-cyan-cta)] transition-[width] duration-500"
                    style={{
                      width: `${Math.round(
                        (delivered / Math.max(1, batchTotal.current)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : confirmAll ? (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-xs font-bold text-ink">
                  Send {pending} DM{pending === 1 ? "" : "s"}?
                  <span className="ml-1 font-medium text-ink-soft">
                    about {formatEta(pending)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => void queueAll(pending)}
                  disabled={busy !== null}
                  title="Yes, start sending"
                  aria-label="Yes, start sending"
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--color-cyan-cta)] px-4 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer sm:h-9"
                >
                  <CheckIcon className="h-4 w-4" />
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAll(false)}
                  title="No, don't send"
                  aria-label="No, don't send"
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-4 text-sm font-bold text-ink-soft transition-colors hover:bg-brand-50 cursor-pointer sm:h-9"
                >
                  <CloseIcon className="h-4 w-4" />
                  No
                </button>
              </div>
            ) : confirmClear ? (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-xs font-bold text-ink">
                  Clear the warning on {pending} without sending?
                </p>
                <button
                  type="button"
                  onClick={() => void dismissAll()}
                  disabled={busy !== null}
                  title="Yes, mark them all as handled"
                  aria-label="Yes, mark them all as handled"
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer sm:h-9"
                >
                  <CheckIcon className="h-4 w-4" />
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  title="No, keep the warning"
                  aria-label="No, keep the warning"
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-4 text-sm font-bold text-ink-soft transition-colors hover:bg-brand-50 cursor-pointer sm:h-9"
                >
                  <CloseIcon className="h-4 w-4" />
                  No
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmAll(true)}
                  disabled={busy !== null || !!halted}
                  title={`Send all ${pending}, paced at about one every three minutes`}
                  aria-label={`Send all ${pending}, paced at about one every three minutes`}
                  className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-cyan-cta)] px-4 py-3 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer sm:py-2.5"
                >
                  <SendIcon className="h-4 w-4" />
                  Send all {pending}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  disabled={busy !== null}
                  title={`Already handled all ${pending} — clear the warning without sending`}
                  aria-label={`Already handled all ${pending} — clear the warning without sending`}
                  className="inline-flex h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 text-xs font-bold text-ink-soft transition-colors hover:bg-brand-50 hover:text-ink disabled:opacity-50 cursor-pointer sm:h-[42px]"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Compact time left before Instagram's window shuts, e.g. `4d` or `9h`. */
function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "0h";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return `${Math.max(1, hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** How long the paced worker needs for this many messages. */
function formatEta(count: number): string {
  const minutes = count * 3;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
