"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CrossPostMediaType,
  CrossPostPlatform,
  CrossPostValidation,
} from "@/lib/cross-post/types";
import { isVideoMime } from "@/lib/cross-post/types";
import { CrossPostProgress } from "@/components/cross-post-progress";

export interface ConnectedAccountOption {
  id: string;
  label: string;
}

export interface ConnectedAccounts {
  instagram: ConnectedAccountOption | null;
  facebookPages: ConnectedAccountOption[];
  threads: ConnectedAccountOption | null;
  linkedin: ConnectedAccountOption | null;
  rednote: ConnectedAccountOption | null;
  wechat: ConnectedAccountOption | null;
}

const PLATFORM_LABELS: Record<CrossPostPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  linkedin: "LinkedIn",
  rednote: "RedNote",
  wechat: "WeChat Moments",
};

interface SelectedPlatform {
  platform: CrossPostPlatform;
  accountRef: string;
  enabled: boolean;
}

function inferMediaType(files: File[]): CrossPostMediaType {
  const hasVideo = files.some((f) => isVideoMime(f.type));
  if (hasVideo) return "video";
  if (files.length > 1) return "carousel";
  return "image";
}

export function CrossPostComposer({
  accounts,
}: {
  accounts: ConnectedAccounts;
}) {
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [skipInvalidOnly, setSkipInvalidOnly] = useState(false);
  const [validation, setValidation] = useState<CrossPostValidation | null>(
    null,
  );
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [fbPageRef, setFbPageRef] = useState(
    accounts.facebookPages[0]?.id ?? "",
  );

  const availablePlatforms = useMemo(() => {
    const list: Array<{ platform: CrossPostPlatform; accountRef: string }> = [];
    if (accounts.instagram) {
      list.push({ platform: "instagram", accountRef: accounts.instagram.id });
    }
    if (accounts.facebookPages.length > 0) {
      list.push({
        platform: "facebook",
        accountRef: accounts.facebookPages[0].id,
      });
    }
    if (accounts.threads) {
      list.push({ platform: "threads", accountRef: accounts.threads.id });
    }
    if (accounts.linkedin) {
      list.push({ platform: "linkedin", accountRef: accounts.linkedin.id });
    }
    if (accounts.rednote) {
      list.push({ platform: "rednote", accountRef: accounts.rednote.id });
    }
    if (accounts.wechat) {
      list.push({ platform: "wechat", accountRef: accounts.wechat.id });
    }
    return list;
  }, [accounts]);

  const [selected, setSelected] = useState<SelectedPlatform[]>(() =>
    availablePlatforms.map((p) => ({
      ...p,
      enabled: true,
    })),
  );

  useEffect(() => {
    setSelected(
      availablePlatforms.map((p) => ({
        ...p,
        enabled: selected.find(
          (s) => s.platform === p.platform && s.accountRef === p.accountRef,
        )?.enabled ?? true,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePlatforms]);

  const enabledPlatforms = selected.filter((s) => s.enabled);
  const mediaType = inferMediaType(files);

  const runValidation = useCallback(async () => {
    if (enabledPlatforms.length === 0) {
      setValidation(null);
      return;
    }

    setValidating(true);
    try {
      const res = await fetch("/api/cross-post/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          title: title || null,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          media_type: mediaType,
          media: files.map((f, i) => ({
            public_url: "",
            mime: f.type,
            sort_order: i,
          })),
          platforms: enabledPlatforms.map((p) => p.platform),
        }),
      });
      const data = await res.json();
      if (res.ok) setValidation(data);
    } catch {
      setValidation(null);
    } finally {
      setValidating(false);
    }
  }, [caption, title, tags, files, mediaType, enabledPlatforms]);

  useEffect(() => {
    const timer = setTimeout(runValidation, 500);
    return () => clearTimeout(timer);
  }, [runValidation]);

  function togglePlatform(platform: CrossPostPlatform, accountRef: string) {
    setSelected((prev) =>
      prev.map((s) =>
        s.platform === platform && s.accountRef === accountRef
          ? { ...s, enabled: !s.enabled }
          : s,
      ),
    );
  }

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const videos = picked.filter((f) => isVideoMime(f.type));
    const images = picked.filter((f) => !isVideoMime(f.type));

    if (videos.length > 0 && images.length > 0) {
      setSubmitError("Choose either images or one video, not both.");
      return;
    }
    if (videos.length > 1) {
      setSubmitError("Only one video is allowed.");
      return;
    }
    if (images.length > 20) {
      setSubmitError("Maximum 20 images.");
      return;
    }

    setSubmitError(null);
    setFiles(picked);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (enabledPlatforms.length === 0) {
      setSubmitError("Select at least one platform.");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("caption", caption);
      if (title) form.set("title", title);
      if (tags) form.set("tags", tags);
      form.set("skipInvalidOnly", String(skipInvalidOnly));
      form.set(
        "platforms",
        JSON.stringify(
          enabledPlatforms.map((p) => ({
            platform: p.platform,
            accountRef:
              p.platform === "facebook"
                ? fbPageRef || accounts.facebookPages[0]?.id
                : p.accountRef,
          })),
        ),
      );
      for (const file of files) {
        form.append("files", file);
      }

      const res = await fetch("/api/cross-post", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to create post");
        return;
      }

      setActivePostId(data.id);
      setCaption("");
      setTitle("");
      setTags("");
      setFiles([]);
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasAnyAccount = availablePlatforms.length > 0;

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="glass rounded-3xl p-5 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-ink">New cross-post</h2>
          <p className="text-sm text-ink-soft">
            Publish once to all connected channels.
          </p>
        </div>

        {!hasAnyAccount && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Connect at least one channel before posting.
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-soft">
            Caption
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-sm text-ink outline-none focus:border-brand-300"
            placeholder="Write your post caption…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-soft">
              RedNote title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-2.5 text-sm text-ink outline-none focus:border-brand-300"
              placeholder="Optional — for RedNote 图文"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-soft">
              RedNote tags
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-2.5 text-sm text-ink outline-none focus:border-brand-300"
              placeholder="Comma-separated tags"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-soft">
            Media — up to 20 images or one video
          </label>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={onFilesChange}
            className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-xl file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          {files.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              {files.length} file{files.length !== 1 ? "s" : ""} selected
              {mediaType === "video" ? " (video)" : ""}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-ink-soft">Platforms</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((s) => (
              <label
                key={`${s.platform}-${s.accountRef}`}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors ${
                  s.enabled
                    ? "bg-brand-500/15 text-brand-700 ring-1 ring-brand-300"
                    : "bg-white/60 text-ink-soft"
                }`}
              >
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={() => togglePlatform(s.platform, s.accountRef)}
                  className="sr-only"
                />
                {PLATFORM_LABELS[s.platform]}
              </label>
            ))}
          </div>

          {accounts.facebookPages.length > 1 &&
            selected.some((s) => s.platform === "facebook" && s.enabled) && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-ink-soft">
                Facebook Page
              </label>
              <select
                value={fbPageRef}
                onChange={(e) => setFbPageRef(e.target.value)}
                className="w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-2.5 text-sm text-ink outline-none"
              >
                {accounts.facebookPages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {(validation || validating) && (
          <div className="rounded-2xl bg-white/60 p-4 text-sm">
            <p className="mb-2 font-semibold text-ink">
              Validation {validating ? "…" : validation?.ok ? "passed" : "issues"}
            </p>
            {validation?.warnings.map((w) => (
              <p key={w} className="text-xs text-amber-700">
                {w}
              </p>
            ))}
            {validation?.errors.map((err) => (
              <p key={err} className="text-xs text-red-600">
                {err}
              </p>
            ))}
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={skipInvalidOnly}
            onChange={(e) => setSkipInvalidOnly(e.target.checked)}
            className="rounded"
          />
          Post only to platforms that pass validation
        </label>

        {submitError && (
          <p className="text-sm font-medium text-red-600">{submitError}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !hasAnyAccount}
          className="w-full rounded-2xl bg-gradient-to-r from-brand-500 to-[var(--color-cyan-cta)] py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
        >
          {submitting ? "Publishing…" : "Publish cross-post"}
        </button>
      </form>

      {activePostId && (
        <CrossPostProgress postId={activePostId} onDone={() => {}} />
      )}
    </div>
  );
}
