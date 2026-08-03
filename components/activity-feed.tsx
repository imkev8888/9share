"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/status-pill";
import { PlatformBadge } from "@/components/platform-badge";
import { MediaThumb } from "@/components/media-thumb";
import { shortSkipReason } from "@/lib/skip-reason";
import {
  ExternalLinkIcon,
  MessageIcon,
  PencilIcon,
  ReplyIcon,
  SendIcon,
  TrashIcon,
} from "@/components/icons";

export interface ActivityLog {
  id: string;
  automation_id: string | null;
  account_id: string | null;
  comment_id: string | null;
  commenter_username: string | null;
  comment_text: string | null;
  dm_text: string | null;
  public_reply_text: string | null;
  public_reply_id: string | null;
  status: string;
  error: string | null;
  source: string | null;
  created_at: string;
  fb_page_id: string | null;
  /** From the linked automation — used when dm_text / public_reply_text weren't stored. */
  dm_template?: string | null;
  public_reply_template?: string | null;
}

export interface ActivityPost {
  automationId: string;
  mediaId: string;
  name: string;
  thumbnail: string | null;
  permalink: string | null;
  caption: string | null;
  dmTemplate?: string | null;
  publicReplyTemplate?: string | null;
  accountId?: string | null;
}

function personalize(template: string, username: string | null): string {
  return template.replaceAll("{{username}}", username ? `@${username}` : "@there");
}

export interface ActivityFeedProps {
  accountId: string | null;
  username: string | null;
  posts: ActivityPost[];
  initialLogs: ActivityLog[];
}

export function ActivityFeed({
  accountId,
  username,
  posts,
  initialLogs,
}: ActivityFeedProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const postsByAutomation = useMemo(() => {
    const map = new Map<string, ActivityPost>();
    for (const p of posts) map.set(p.automationId, p);
    return map;
  }, [posts]);

  const flash = useCallback((msg: string) => {
    setStatus(msg);
    setActionError(null);
    window.setTimeout(() => setStatus((s) => (s === msg ? null : s)), 3200);
  }, []);

  function setError(msg: string) {
    setActionError(msg);
    setStatus(null);
  }

  return (
    <div className="space-y-5">
      {(status || actionError) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            actionError
              ? "border border-red-200 bg-red-50 text-red-700"
              : "border border-cyan-200 bg-cyan-50 text-cyan-800"
          }`}
          role="status"
        >
          {actionError ?? status}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-brand-50 p-3 text-brand-500">
            <MessageIcon className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-ink">No activity yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            {accountId
              ? "Activity shows up here when someone triggers an automation, or when you comment from Tracking."
              : "Connect Instagram and create an automation — activity shows up here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <ActivityRow
              key={log.id}
              log={log}
              accountId={accountId}
              connectedUsername={username}
              post={
                log.automation_id
                  ? (postsByAutomation.get(log.automation_id) ?? null)
                  : null
              }
              onUpdated={(next) => {
                setLogs((prev) =>
                  prev.map((l) => (l.id === next.id ? next : l)),
                );
                flash("Updated");
              }}
              onDeleted={(id) => {
                setLogs((prev) => prev.filter((l) => l.id !== id));
                flash("Comment deleted");
              }}
              onReplyCleared={(id) => {
                setLogs((prev) =>
                  prev.map((l) =>
                    l.id === id
                      ? {
                          ...l,
                          public_reply_id: null,
                          public_reply_text: null,
                        }
                      : l,
                  ),
                );
                flash("Reply deleted");
              }}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  log,
  accountId,
  connectedUsername,
  post,
  onUpdated,
  onDeleted,
  onReplyCleared,
  onError,
}: {
  log: ActivityLog;
  accountId: string | null;
  connectedUsername: string | null;
  post: ActivityPost | null;
  onUpdated: (log: ActivityLog) => void;
  onDeleted: (id: string) => void;
  onReplyCleared: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const isManual = log.source === "manual";
  const isIg = !log.fb_page_id;

  const resolveAccountId = log.account_id || accountId;

  const dmTemplate = log.dm_template || post?.dmTemplate || null;
  const replyTemplate =
    log.public_reply_template || post?.publicReplyTemplate || null;

  const dmDisplay =
    log.dm_text ||
    (log.status === "sent" && dmTemplate
      ? personalize(dmTemplate, log.commenter_username)
      : null);

  const replyDisplay =
    log.public_reply_text ||
    (log.status === "sent" && replyTemplate?.trim()
      ? personalize(replyTemplate, log.commenter_username)
      : null);

  const expectsPublicReply =
    !isManual &&
    isIg &&
    log.status === "sent" &&
    !!(log.public_reply_id || log.public_reply_text || replyTemplate?.trim());

  const skipNote =
    log.status === "skipped" ? shortSkipReason(log.error) : null;

  return (
    <article className="glass rounded-3xl p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        {post && (
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-brand-50">
            <MediaThumb
              src={post.thumbnail}
              accountId={post.accountId || resolveAccountId}
              mediaId={post.mediaId}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">
              {isManual
                ? `@${log.commenter_username || connectedUsername || "you"}`
                : `@${log.commenter_username ?? "someone"}`}
            </p>
            <PlatformBadge platform={log.fb_page_id ? "facebook" : "instagram"} />
            <StatusPill status={log.status} />
            {skipNote && (
              <span
                className="truncate rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                title={log.error ?? skipNote}
              >
                {skipNote}
              </span>
            )}
            {isManual && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                Your comment
              </span>
            )}
          </div>
          {post && (
            <p className="mt-0.5 truncate text-xs text-ink-soft">{post.name}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {post?.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-soft transition-colors hover:text-brand-600"
              aria-label="Open on Instagram"
            >
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
          )}
          <time className="text-xs text-ink-soft">
            {new Date(log.created_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </time>
        </div>
      </div>

      <div className="space-y-2">
        {!isManual && (
          <Block
            icon={<MessageIcon className="h-3.5 w-3.5" />}
            label="Their comment"
            text={log.comment_text ?? "—"}
          />
        )}

        {isManual && (
          <OwnCommentBlock
            label="Your comment"
            text={log.comment_text ?? "—"}
            canModerate={isIg && !!resolveAccountId && !!log.comment_id}
            accountId={resolveAccountId}
            commentId={log.comment_id}
            logId={log.id}
            target="comment"
            onSaved={(text, newCommentId) =>
              onUpdated({
                ...log,
                comment_text: text,
                ...(newCommentId ? { comment_id: newCommentId } : {}),
              })
            }
            onDeleted={() => onDeleted(log.id)}
            onError={onError}
          />
        )}

        {dmDisplay && (
          <Block
            icon={<SendIcon className="h-3.5 w-3.5" />}
            label="DM sent"
            text={dmDisplay}
            tone="cyan"
          />
        )}

        {!isManual && replyDisplay && (
          <OwnCommentBlock
            label="Your reply"
            text={replyDisplay}
            canModerate={isIg && !!resolveAccountId}
            accountId={resolveAccountId}
            commentId={log.public_reply_id}
            logId={log.id}
            target="public_reply"
            onResolved={(id, text) =>
              onUpdated({
                ...log,
                public_reply_id: id,
                public_reply_text: text ?? log.public_reply_text,
              })
            }
            onSaved={(text, newCommentId) =>
              onUpdated({
                ...log,
                public_reply_text: text,
                ...(newCommentId ? { public_reply_id: newCommentId } : {}),
              })
            }
            onDeleted={() => onReplyCleared(log.id)}
            onError={onError}
          />
        )}

        {!isManual &&
          log.status === "sent" &&
          !dmDisplay &&
          !replyDisplay &&
          !expectsPublicReply && (
            <p className="text-xs text-ink-soft">
              No public reply was left on this comment.
            </p>
          )}

        {log.status === "failed" && log.error && (
          <p className="text-xs text-red-600">{log.error}</p>
        )}
        {log.status === "skipped" && log.error && (
          <p className="text-xs text-ink-soft">Skipped: {log.error}</p>
        )}
      </div>
    </article>
  );
}

function Block({
  icon,
  label,
  text,
  tone = "brand",
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
  tone?: "brand" | "cyan";
}) {
  const shell = tone === "cyan" ? "bg-cyan-50/80" : "bg-brand-50/70";
  const labelColor = tone === "cyan" ? "text-cyan-700" : "text-brand-600";
  return (
    <div className={`rounded-2xl px-3.5 py-2.5 ${shell}`}>
      <p
        className={`mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${labelColor}`}
      >
        {icon}
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm text-ink">{text}</p>
    </div>
  );
}

function OwnCommentBlock({
  label,
  text,
  canModerate,
  accountId,
  commentId,
  logId,
  target,
  onResolved,
  onSaved,
  onDeleted,
  onError,
}: {
  label: string;
  text: string;
  canModerate: boolean;
  accountId: string | null;
  commentId: string | null;
  logId: string;
  target: "comment" | "public_reply";
  onResolved?: (id: string, text: string | null) => void;
  onSaved: (text: string, newCommentId?: string) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [workingId, setWorkingId] = useState(commentId);

  useEffect(() => {
    if (!editing) setEditText(text);
  }, [text, editing]);

  useEffect(() => {
    setWorkingId(commentId);
  }, [commentId]);

  async function ensureCommentId(): Promise<string | null> {
    if (workingId) return workingId;
    if (target !== "public_reply" || !accountId) return null;
    const res = await fetch("/api/instagram/comments/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, logId }),
    });
    const data = await res.json();
    if (!res.ok || !data.public_reply_id) {
      throw new Error(data.error || "Couldn't find your reply on Instagram");
    }
    setWorkingId(data.public_reply_id);
    onResolved?.(data.public_reply_id, data.public_reply_text ?? null);
    return data.public_reply_id as string;
  }

  async function save() {
    if (!accountId || !editText.trim() || saving) return;
    setSaving(true);
    try {
      const id = await ensureCommentId();
      if (!id) throw new Error("Couldn't find your reply on Instagram");
      const res = await fetch("/api/instagram/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          commentId: id,
          message: editText.trim(),
          logId,
          target,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update comment");
      if (typeof data.commentId === "string") {
        setWorkingId(data.commentId);
      }
      onSaved(
        editText.trim(),
        typeof data.commentId === "string" ? data.commentId : undefined,
      );
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't update comment");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!accountId || deleting) return;
    setDeleting(true);
    try {
      const id = await ensureCommentId();
      if (!id) throw new Error("Couldn't find your reply on Instagram");
      const params = new URLSearchParams({
        accountId,
        commentId: id,
        logId,
        target,
      });
      const res = await fetch(`/api/instagram/comments?${params}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't delete comment");
      onDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't delete comment");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/70 px-3.5 py-2.5 ring-1 ring-brand-100">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-600">
          <ReplyIcon className="h-3.5 w-3.5" />
          {label}
        </p>
        {canModerate && !editing && !confirmDelete && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setEditText(text);
                setEditing(true);
              }}
              className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-white hover:text-ink cursor-pointer"
              aria-label="Edit"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
              aria-label="Delete"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            rows={2}
            className="input resize-y text-sm"
            autoFocus
            disabled={saving}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white/70 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !editText.trim()}
              className="rounded-xl bg-[var(--color-cyan-cta)] px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : confirmDelete ? (
        <div className="rounded-xl bg-red-50 px-3 py-2.5">
          <p className="text-sm font-medium text-red-700">
            Delete this comment?
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              className="rounded-xl bg-red-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60 cursor-pointer"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-ink">{text}</p>
      )}
    </div>
  );
}
