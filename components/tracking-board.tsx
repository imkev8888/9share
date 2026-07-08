"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { StatusPill } from "@/components/status-pill";
import { PlatformBadge } from "@/components/platform-badge";
import {
  ChevronDownIcon,
  SearchIcon,
  SendIcon,
  ReplyIcon,
  MessageIcon,
} from "@/components/icons";

export interface Interaction {
  id: string;
  commenter_username: string | null;
  comment_text: string | null;
  status: string;
  error: string | null;
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
            (i.comment_text ?? "").toLowerCase().includes(q)
          );
        });
        return { ...g, interactions };
      })
      .filter((g) => g.interactions.length > 0);
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

  return (
    <div className="glass overflow-hidden rounded-3xl">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors duration-200 hover:bg-white/50 cursor-pointer sm:p-5"
      >
        {group.thumbnail ? (
          <Image
            src={group.thumbnail}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-500">
            <MessageIcon className="h-5 w-5" />
          </div>
        )}

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

        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <CountChip value={group.counts.sent} tone="cyan" />
          <CountChip value={group.counts.skipped} tone="amber" />
          <CountChip value={group.counts.failed} tone="red" />
        </div>

        <ChevronDownIcon
          className={`h-5 w-5 shrink-0 text-ink-soft transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

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

          {/* Interaction rows */}
          <div className="mt-3 divide-y divide-white/60">
            {group.interactions.map((i) => (
              <InteractionRow
                key={i.id}
                interaction={i}
                hasReply={!!group.publicReply}
              />
            ))}
          </div>
        </div>
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
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">
            @{i.commenter_username ?? "someone"}
          </p>
          <StatusPill status={i.status} />
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
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
