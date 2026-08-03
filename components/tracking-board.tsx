"use client";

import { useMemo, useState } from "react";
import { StatusPill } from "@/components/status-pill";
import { PlatformBadge } from "@/components/platform-badge";
import {
  ChevronDownIcon,
  SearchIcon,
  SendIcon,
  ReplyIcon,
  MessageIcon,
  PencilIcon,
  TrashIcon,
  ExternalLinkIcon,
} from "@/components/icons";
import { shortSkipReason } from "@/lib/skip-reason";
import { MediaThumb } from "@/components/media-thumb";

export interface Interaction {
  id: string;
  comment_id?: string | null;
  commenter_username: string | null;
  comment_text: string | null;
  status: string;
  error: string | null;
  source?: string | null;
  created_at: string;
}

export interface PostGroup {
  automationId: string | null;
  name: string;
  thumbnail: string | null;
  permalink: string | null;
  keyword: string | null;
  dmMessage: string | null;
  publicReply: string | null;
  isActive: boolean;
  platform?: string | null;
  mediaId?: string | null;
  accountId?: string | null;
  fbPageId?: string | null;
  interactions: Interaction[];
  counts: { total: number; sent: number; skipped: number; failed: number };
}

type StatusFilter = "all" | "sent" | "skipped" | "failed";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "skipped", label: "Skipped" },
  { id: "failed", label: "Failed" },
];

export function TrackingBoard({
  groups,
  totals,
}: {
  groups: PostGroup[];
  totals: { sent: number; skipped: number; failed: number };
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => {
        const interactions = g.interactions.filter((i) => {
          if (filter !== "all" && i.status !== filter) return false;
          if (!q) return true;
          return (
            (i.commenter_username ?? "").toLowerCase().includes(q) ||
            (i.comment_text ?? "").toLowerCase().includes(q) ||
            g.name.toLowerCase().includes(q)
          );
        });
        return { ...g, interactions };
      })
      .filter((g) => {
        if (g.interactions.length > 0) return true;
        // Keep quiet campaigns visible so users can still comment on that post
        if (filter === "all" && !q) return true;
        if (q && g.name.toLowerCase().includes(q)) return true;
        return false;
      });
  }, [groups, query, filter]);

  return (
    <div className="space-y-5">
      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <Summary label="DMs sent" value={totals.sent} tone="cyan" />
        <Summary label="Skipped" value={totals.skipped} tone="amber" />
        <Summary label="Failed" value={totals.failed} tone="red" />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5 sm:w-72">
          <SearchIcon className="h-4 w-4 shrink-0 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search user or comment…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft/70"
          />
        </label>

        <div className="glass flex gap-1 rounded-2xl p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors duration-200 cursor-pointer sm:flex-none ${
                filter === f.id
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Per-post groups */}
      {filteredGroups.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center text-sm text-ink-soft">
          No interactions match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => (
            <PostCard key={g.automationId ?? "deleted"} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ group }: { group: PostGroup }) {
  const [open, setOpen] = useState(true);
  const [ownComments, setOwnComments] = useState(() =>
    group.interactions.filter((i) => i.source === "manual" && i.comment_id),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inbound = group.interactions.filter((i) => i.source !== "manual");

  const openLabel =
    group.platform === "facebook" ? "Open on Facebook" : "Open on Instagram";

  return (
    <div className="glass overflow-hidden rounded-3xl">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 sm:gap-3 sm:p-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-4 text-left transition-colors duration-200 hover:opacity-90 cursor-pointer"
        >
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-brand-100">
            <MediaThumb
              src={group.thumbnail}
              accountId={group.accountId}
              mediaId={group.mediaId}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-bold text-ink">{group.name}</p>
              {group.automationId && <PlatformBadge platform={group.platform} />}
              {group.automationId &&
                (group.isActive ? (
                  <span className="hidden shrink-0 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 sm:inline">
                    Active
                  </span>
                ) : (
                  <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 sm:inline">
                    Paused
                  </span>
                ))}
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-soft">
              {group.keyword ? `Trigger: “${group.keyword}”` : "Any comment"} ·{" "}
              {group.counts.total} interaction
              {group.counts.total === 1 ? "" : "s"}
            </p>
          </div>
        </button>

        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <CountChip value={group.counts.sent} tone="cyan" />
          <CountChip value={group.counts.skipped} tone="amber" />
          <CountChip value={group.counts.failed} tone="red" />
        </div>

        {group.permalink && (
          <a
            href={group.permalink}
            target="_blank"
            rel="noopener noreferrer"
            title={openLabel}
            aria-label={openLabel}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-600 transition-colors duration-200 hover:bg-brand-50"
          >
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse campaign" : "Expand campaign"}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-white/60 cursor-pointer"
        >
          <ChevronDownIcon
            className={`h-5 w-5 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {open && (
        <div className="border-t border-white/60">
          {/* Mobile count chips */}
          <div className="flex gap-2 px-4 pt-3 sm:hidden">
            <CountChip value={group.counts.sent} tone="cyan" labelled />
            <CountChip value={group.counts.skipped} tone="amber" labelled />
            <CountChip value={group.counts.failed} tone="red" labelled />
          </div>

          {/* Configured templates for this post */}
          {(group.dmMessage || group.publicReply) && (
            <div className="grid gap-2 px-4 pt-3 sm:grid-cols-2 sm:px-5">
              {group.dmMessage && (
                <Template
                  icon={<SendIcon className="h-3.5 w-3.5" />}
                  label="DM template"
                  text={group.dmMessage}
                />
              )}
              {group.publicReply && (
                <Template
                  icon={<ReplyIcon className="h-3.5 w-3.5" />}
                  label="Public reply"
                  text={group.publicReply}
                />
              )}
            </div>
          )}

          {group.automationId && group.mediaId && (
            <PostAnnouncement
              automationId={group.automationId}
              comments={ownComments}
              onChange={setOwnComments}
              onError={setErrorMsg}
            />
          )}

          {errorMsg && (
            <div
              className="mx-4 mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 sm:mx-5"
              role="status"
            >
              {errorMsg}
            </div>
          )}

          {/* Interaction rows (inbound / automation) */}
          <div className="mt-3 divide-y divide-white/60">
            {inbound.length === 0 ? (
              <p className="px-4 py-4 text-xs text-ink-soft sm:px-5">
                No inbound comments yet for this post.
              </p>
            ) : (
              inbound.map((i) => (
                <InteractionRow
                  key={i.id}
                  interaction={i}
                  hasReply={!!group.publicReply}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Collapsed “Comment” control — post an announcement, then edit or delete it. */
function PostAnnouncement({
  automationId,
  comments,
  onChange,
  onError,
}: {
  automationId: string;
  comments: Interaction[];
  onChange: (rows: Interaction[]) => void;
  onError: (msg: string | null) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || posting) return;
    setPosting(true);
    onError(null);
    try {
      const res = await fetch("/api/social/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId, message: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't post");
      const log = data.log as Interaction | null;
      onChange([
        {
          id: log?.id ?? crypto.randomUUID(),
          comment_id: log?.comment_id ?? data.id ?? null,
          commenter_username: log?.commenter_username ?? "you",
          comment_text: log?.comment_text ?? draft.trim(),
          status: "sent",
          error: null,
          source: "manual",
          created_at: log?.created_at ?? new Date().toISOString(),
        },
        ...comments,
      ]);
      setDraft("");
      setComposing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't post");
    } finally {
      setPosting(false);
    }
  }

  async function handleSaveEdit(row: Interaction) {
    if (!row.comment_id || !editDraft.trim() || busyId) return;
    setBusyId(row.id);
    onError(null);
    try {
      const res = await fetch("/api/social/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automationId,
          commentId: row.comment_id,
          logId: row.id,
          message: editDraft.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update");
      onChange(
        comments.map((c) =>
          c.id === row.id ? { ...c, comment_text: editDraft.trim() } : c,
        ),
      );
      setEditingId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't update");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: Interaction) {
    if (!row.comment_id || busyId) return;
    if (!window.confirm("Delete this comment?")) return;
    setBusyId(row.id);
    onError(null);
    try {
      const params = new URLSearchParams({
        automationId,
        commentId: row.comment_id,
        logId: row.id,
      });
      const res = await fetch(`/api/social/comments?${params}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't delete");
      onChange(comments.filter((c) => c.id !== row.id));
      if (editingId === row.id) setEditingId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-4 mt-3 space-y-2 sm:mx-5">
      {comments.map((c) => (
        <div
          key={c.id}
          className="rounded-2xl border border-white/70 bg-white/60 px-3 py-2.5"
        >
          {editingId === c.id ? (
            <div className="space-y-2">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={2}
                className="input min-h-[3rem] resize-y bg-white text-sm"
                disabled={busyId === c.id}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busyId === c.id || !editDraft.trim()}
                  onClick={() => void handleSaveEdit(c)}
                  className="rounded-lg bg-[var(--color-cyan-cta)] px-3 py-1 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
                >
                  {busyId === c.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-ink">
                {c.comment_text}
              </p>
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  title="Edit"
                  disabled={busyId === c.id}
                  onClick={() => {
                    setEditingId(c.id);
                    setEditDraft(c.comment_text ?? "");
                    setComposing(false);
                  }}
                  className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50 cursor-pointer"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Delete"
                  disabled={busyId === c.id}
                  onClick={() => void handleDelete(c)}
                  className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {composing ? (
        <form
          onSubmit={(e) => void handlePost(e)}
          className="space-y-2 rounded-2xl border border-brand-100 bg-brand-50/50 p-3"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Write a comment…"
            className="input min-h-[3rem] resize-y bg-white text-sm"
            disabled={posting}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setDraft("");
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={posting || !draft.trim()}
              className="rounded-lg bg-[var(--color-cyan-cta)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setComposing(true);
            setEditingId(null);
            onError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50 cursor-pointer"
        >
          <MessageIcon className="h-3.5 w-3.5" />
          Comment
        </button>
      )}
    </div>
  );
}

function InteractionRow({
  interaction: i,
  hasReply,
}: {
  interaction: Interaction;
  hasReply: boolean;
}) {
  const sent = i.status === "sent";
  const skipNote =
    i.status === "skipped" ? shortSkipReason(i.error) : null;
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">
            @{i.commenter_username ?? "someone"}
          </p>
          <StatusPill status={i.status} />
          {skipNote && (
            <span
              className="truncate rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
              title={i.error ?? skipNote}
            >
              {skipNote}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-soft">
          {i.comment_text ?? "—"}
        </p>
        {i.status === "failed" && i.error && (
          <p className="mt-1 line-clamp-2 text-xs text-red-600">{i.error}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Outcome ok={sent} icon={<SendIcon className="h-3 w-3" />} label="DM" />
        {hasReply && (
          <Outcome
            ok={sent}
            icon={<ReplyIcon className="h-3 w-3" />}
            label="Reply"
          />
        )}
        <time className="ml-1 hidden text-[11px] text-ink-soft sm:block">
          {formatTime(i.created_at)}
        </time>
      </div>
    </div>
  );
}

function Outcome({
  ok,
  icon,
  label,
}: {
  ok: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        ok ? "bg-cyan-100 text-cyan-700" : "bg-gray-100 text-gray-400"
      }`}
      title={ok ? `${label} sent` : `${label} not sent`}
    >
      {icon}
      {label}
    </span>
  );
}

function Template({
  icon,
  label,
  text,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-brand-50/70 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-600">
        {icon}
        {label}
      </p>
      <p className="line-clamp-3 whitespace-pre-wrap text-xs text-ink-soft">
        {text}
      </p>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "red";
}) {
  const tones = {
    cyan: "text-cyan-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };
  return (
    <div className="glass rounded-2xl p-4 text-center sm:text-left">
      <p className={`text-2xl font-extrabold ${tones[tone]}`}>{value}</p>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
    </div>
  );
}

function CountChip({
  value,
  tone,
  labelled = false,
}: {
  value: number;
  tone: "cyan" | "amber" | "red";
  labelled?: boolean;
}) {
  const tones = {
    cyan: "bg-cyan-100 text-cyan-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
  };
  const labels = { cyan: "sent", amber: "skipped", red: "failed" };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}
    >
      {value}
      {labelled && <span className="font-medium">{labels[tone]}</span>}
    </span>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  // Fixed locale so SSR and client match (avoids hydration mismatch).
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
