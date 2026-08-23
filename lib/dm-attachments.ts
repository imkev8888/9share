/**
 * Pictures and video for an auto-reply.
 *
 * Meta drops media attachments from a private reply silently, so a campaign's
 * image cannot ride along with the auto-DM. What Meta does allow in that first
 * DM is a button. The person taps it, a normal 24-hour messaging window opens,
 * and the media follows.
 *
 * Everything here is the shared truth for that: the editor, the upload route,
 * the server actions and the webhook sender all validate against these numbers,
 * so none of them can drift into accepting something Meta will reject.
 */

export const BUCKET = "automation_media";

/** Meta accepts up to ten attachment objects for one recipient. */
export const MAX_ATTACHMENTS = 10;

/** Button titles are truncated past this, so we refuse rather than ship a clipped label. */
export const MAX_BUTTON_LABEL = 20;

/** A button template's text. Longer messages have to go out without a button. */
export const MAX_BUTTON_TEMPLATE_TEXT = 640;

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg"] as const;
export const VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/avi",
  "video/ogg",
  "video/webm",
] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

/**
 * Marks a button tap as "this person wants campaign X's media". Meta echoes the
 * payload back verbatim, so it names the campaign outright and the handler
 * never has to guess.
 */
export const MEDIA_POSTBACK_PREFIX = "DM_MEDIA:";

export function mediaPostbackPayload(automationId: string): string {
  return `${MEDIA_POSTBACK_PREFIX}${automationId}`;
}

/** The campaign a tap refers to, or null if this was not one of our buttons. */
export function parseMediaPostback(
  payload: string | null | undefined,
): string | null {
  if (!payload?.startsWith(MEDIA_POSTBACK_PREFIX)) return null;
  const id = payload.slice(MEDIA_POSTBACK_PREFIX.length).trim();
  return id || null;
}

export type AttachmentKind = "image" | "video";

export interface DmAttachment {
  /** Public URL. Meta fetches this itself, so it cannot be a signed URL. */
  url: string;
  /** Storage path, kept so the file can be deleted when the user removes it. */
  path: string;
  type: AttachmentKind;
  mime: string;
}

/** Human-facing summary of what may be attached, for the editor's hint line. */
export const ACCEPT_ATTR = "image/png,image/jpeg,video/mp4,video/quicktime,video/webm";

export function attachmentKind(mime: string): AttachmentKind | null {
  const m = mime.toLowerCase();
  if ((IMAGE_MIMES as readonly string[]).includes(m)) return "image";
  if ((VIDEO_MIMES as readonly string[]).includes(m)) return "video";
  return null;
}

function mb(bytes: number) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * Why a file cannot be sent, or null when it can. Phrased for the person
 * choosing the file rather than for a log.
 */
export function rejectFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  const kind = attachmentKind(file.type);
  if (!kind) {
    return `${file.name}: Instagram only accepts PNG or JPEG images, and MP4, MOV or WebM video.`;
  }
  const cap = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > cap) {
    return `${file.name} is ${mb(file.size)}. Instagram's limit for ${kind} is ${mb(cap)}.`;
  }
  return null;
}

/** Code points, so an emoji counts as the one character it looks like. */
export function labelLength(label: string): number {
  return Array.from(label).length;
}

/**
 * Whether this label can go on a button, or why not.
 *
 * A label is only required once there is media to unlock — a campaign with no
 * attachments keeps sending exactly the plain-text DM it always did.
 */
export function rejectButtonLabel(
  label: string,
  hasAttachments: boolean,
): string | null {
  const trimmed = label.trim();
  if (!trimmed) {
    return hasAttachments
      ? "Add a button label. Without a button there is no way for the person to unlock the media."
      : null;
  }
  if (/[\r\n]/.test(label)) return "A button label cannot span lines.";
  if (labelLength(trimmed) > MAX_BUTTON_LABEL) {
    return `Instagram cuts button labels off after ${MAX_BUTTON_LABEL} characters.`;
  }
  return null;
}

/** Whether the DM body still fits above a button, or why not. */
export function rejectDmForButton(dmMessage: string): string | null {
  if (dmMessage.length > MAX_BUTTON_TEMPLATE_TEXT) {
    return `A DM carrying a button is limited to ${MAX_BUTTON_TEMPLATE_TEXT} characters — this one is ${dmMessage.length}.`;
  }
  return null;
}

/**
 * Only URLs we uploaded ourselves. Meta fetches the URL from its own servers,
 * so accepting arbitrary ones would turn a saved campaign into a request
 * Instagram makes on someone else's behalf.
 */
function ownStoragePrefix(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;
}

/**
 * Sanitize whatever the browser sent. Anything unrecognised is dropped rather
 * than stored, so a bad row can never reach the sender.
 */
export function parseAttachments(raw: unknown): DmAttachment[] {
  if (!Array.isArray(raw)) return [];
  const prefix = ownStoragePrefix();
  const out: DmAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { url, path, type, mime } = item as Record<string, unknown>;
    if (typeof url !== "string" || typeof path !== "string") continue;
    if (prefix && !url.startsWith(prefix)) continue;
    if (type !== "image" && type !== "video") continue;
    if (typeof mime !== "string" || attachmentKind(mime) !== type) continue;
    out.push({ url, path, type, mime });
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}
