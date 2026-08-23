"use client";

import { useRef, useState } from "react";
import {
  ACCEPT_ATTR,
  MAX_ATTACHMENTS,
  MAX_BUTTON_LABEL,
  MAX_BUTTON_TEMPLATE_TEXT,
  labelLength,
  rejectButtonLabel,
  rejectDmForButton,
  rejectFile,
  type DmAttachment,
} from "@/lib/dm-attachments";
import {
  CloseIcon,
  CursorClickIcon,
  ImageIcon,
  VideoIcon,
} from "@/components/icons";

/** Short, generic, and comfortably inside Meta's 20-character cap. */
export const DEFAULT_BUTTON_LABEL = "Send me the info";

/**
 * Pictures and video for an auto-reply, plus the button that unlocks them.
 *
 * Meta drops media from a private reply silently, so the picture cannot ride
 * along with the auto-DM. It travels as a follow-up the moment the person taps
 * the button, which is what opens Instagram's 24-hour messaging window. The
 * copy here says so plainly, because a picture that "sent" but never arrived is
 * the kind of thing people only discover from a customer.
 */
export function DmAttachmentsField({
  attachments,
  buttonLabel,
  dmMessage,
  automationId,
  disabled = false,
  showFacebookNote = false,
  onAttachmentsChange,
  onButtonLabelChange,
}: {
  attachments: DmAttachment[];
  buttonLabel: string;
  dmMessage: string;
  /** Groups the upload under a saved campaign; drafts are fine without it. */
  automationId?: string;
  disabled?: boolean;
  /** This campaign also targets Facebook, which this feature does not cover yet. */
  showFacebookNote?: boolean;
  onAttachmentsChange: (next: DmAttachment[]) => void;
  onButtonLabelChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Files this session uploaded, and therefore the only ones safe to delete.
   * Anything that arrived already attached may be shared — duplicating a
   * campaign copies the URLs, not the files — so those are merely detached.
   */
  const ownUploads = useRef(new Set<string>());

  const has = attachments.length > 0;
  const room = MAX_ATTACHMENTS - attachments.length;
  const labelError = rejectButtonLabel(buttonLabel, has);
  const dmError = has ? rejectDmForButton(dmMessage) : null;
  const labelChars = labelLength(buttonLabel.trim());

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setError(null);

    if (files.length > room) {
      setError(
        `Instagram accepts ${MAX_ATTACHMENTS} attachments per person. You have room for ${room} more.`,
      );
      return;
    }
    for (const file of files) {
      const reason = rejectFile(file);
      if (reason) {
        setError(reason);
        return;
      }
    }

    setUploading(true);
    try {
      const form = new FormData();
      if (automationId) form.set("automationId", automationId);
      for (const file of files) form.append("files", file);

      const res = await fetch("/api/automations/media", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't upload");

      const fresh = data.attachments as DmAttachment[];
      for (const a of fresh) ownUploads.current.add(a.path);
      onAttachmentsChange([...attachments, ...fresh]);
      // A first attachment is useless without a button to unlock it, so give
      // one rather than let the campaign save into a dead end.
      if (!buttonLabel.trim()) onButtonLabelChange(DEFAULT_BUTTON_LABEL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(item: DmAttachment) {
    onAttachmentsChange(attachments.filter((a) => a.path !== item.path));
    setError(null);
    if (!ownUploads.current.has(item.path)) return;
    ownUploads.current.delete(item.path);
    // Best effort: a leftover object is harmless, a blocked editor is not.
    void fetch(`/api/automations/media?path=${encodeURIComponent(item.path)}`, {
      method: "DELETE",
    });
  }

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ImageIcon className="h-4 w-4 text-brand-500" />
          Picture or video (optional)
        </p>
        {has && (
          <span className="text-[11px] font-semibold text-ink-soft">
            {attachments.length}/{MAX_ATTACHMENTS}
          </span>
        )}
      </div>

      {has && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.path}
              className="group relative h-16 w-16 overflow-hidden rounded-xl border border-white bg-white shadow-sm"
            >
              {a.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-ink/5 text-ink-soft">
                  <VideoIcon className="h-5 w-5" />
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(a)}
                disabled={disabled || uploading}
                title="Remove"
                aria-label="Remove this attachment"
                className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-bl-lg bg-ink/70 text-white transition-colors hover:bg-red-600 disabled:opacity-50 cursor-pointer"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        hidden
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading || room <= 0}
        className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60 cursor-pointer"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {uploading ? "Uploading…" : has ? "Add another" : "Attach"}
      </button>
      <p className="mt-1.5 text-xs text-ink-soft">
        PNG or JPEG up to 8 MB, MP4, MOV or WebM up to 25 MB. Up to{" "}
        {MAX_ATTACHMENTS}.
      </p>

      {has && (
        <div className="mt-3 border-t border-white/70 pt-3">
          <label className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-ink">
            <span className="flex items-center gap-1.5">
              <CursorClickIcon className="h-4 w-4 text-brand-500" />
              Button label
            </span>
            <span
              className={`text-[11px] font-semibold ${
                labelChars > MAX_BUTTON_LABEL ? "text-red-600" : "text-ink-soft"
              }`}
            >
              {labelChars}/{MAX_BUTTON_LABEL}
            </span>
          </label>
          <input
            value={buttonLabel}
            onChange={(e) => onButtonLabelChange(e.target.value)}
            disabled={disabled}
            placeholder={DEFAULT_BUTTON_LABEL}
            className="input"
          />
          <p className="mt-1.5 text-xs text-ink-soft">
            Instagram will not let a DM carry a picture until the person answers
            it. This button is that answer: they tap it, and the media goes out
            straight away.
          </p>
          {dmMessage.length > 0 && (
            <p
              className={`mt-1 text-xs ${
                dmError ? "font-semibold text-red-600" : "text-ink-soft"
              }`}
            >
              DM message: {dmMessage.length}/{MAX_BUTTON_TEMPLATE_TEXT}{" "}
              characters
              {dmError ? " — too long to carry a button." : ""}
            </p>
          )}
          {showFacebookNote && (
            <p className="mt-1 text-xs text-ink-soft">
              Instagram only for now. Facebook posts in this campaign still send
              the DM, without the button or the media.
            </p>
          )}
        </div>
      )}

      {(error || labelError) && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error ?? labelError}
        </p>
      )}
    </div>
  );
}
