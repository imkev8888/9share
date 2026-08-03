import type {
  CrossPostInput,
  CrossPostPlatform,
  CrossPostValidation,
  PlatformValidation,
  ValidationFix,
  ValidationResult,
} from "./types";

const IG_CAPTION_MAX = 2200;
const IG_IMAGE_MAX = 10;
const FB_CAPTION_MAX = 63_000;
const FB_IMAGE_MAX = 20;
const THREADS_CAPTION_MAX = 500;
const THREADS_IMAGE_MAX = 20;
const LINKEDIN_CAPTION_MAX = 3000;
const REDNOTE_TITLE_MAX = 20;
const REDNOTE_BODY_MAX = 1000;
const WECHAT_CAPTION_WARN = 1000;
const WECHAT_IMAGE_MAX = 9;

function base(platform: CrossPostPlatform): PlatformValidation {
  return { platform, ok: true, errors: [], warnings: [], fixes: [] };
}

function mergeResults(results: PlatformValidation[]): CrossPostValidation {
  const errors = results.flatMap((r) =>
    r.errors.map((e) => `[${r.platform}] ${e}`),
  );
  const warnings = results.flatMap((r) =>
    r.warnings.map((w) => `[${r.platform}] ${w}`),
  );
  const fixes = results.flatMap((r) => r.fixes);
  return {
    ok: results.every((r) => r.ok),
    errors,
    warnings,
    fixes,
    platforms: results,
  };
}

function imageCount(input: CrossPostInput): number {
  return input.media.filter((m) =>
    (m.mime ?? "").startsWith("image/"),
  ).length;
}

function hasVideo(input: CrossPostInput): boolean {
  return (
    input.media_type === "video" ||
    input.media.some((m) => (m.mime ?? "").startsWith("video/"))
  );
}

function hasImages(input: CrossPostInput): boolean {
  return (
    input.media_type === "image" ||
    input.media_type === "carousel" ||
    imageCount(input) > 0
  );
}

function caption(input: CrossPostInput): string {
  return (input.caption ?? "").trim();
}

function truncateFix(
  platform: CrossPostPlatform,
  field: string,
  max: number,
  value: string,
): ValidationFix {
  return {
    platform,
    field,
    action: "truncate",
    message: `Truncate ${field} to ${max} characters`,
    value: value.slice(0, max),
  };
}

export function validateForInstagram(input: CrossPostInput): PlatformValidation {
  const r = base("instagram");
  const text = caption(input);
  const images = imageCount(input);
  const video = hasVideo(input);

  if (!hasImages(input) && !video) {
    r.ok = false;
    r.errors.push("Instagram requires at least one image or video (text-only not supported).");
    r.fixes.push({
      platform: "instagram",
      field: "media",
      action: "skip_platform",
      message: "Skip Instagram or add media",
    });
  }

  if (text.length > IG_CAPTION_MAX) {
    r.ok = false;
    r.errors.push(`Caption exceeds ${IG_CAPTION_MAX} characters (${text.length}).`);
    r.fixes.push(truncateFix("instagram", "caption", IG_CAPTION_MAX, text));
  }

  if (images > IG_IMAGE_MAX) {
    r.ok = false;
    r.errors.push(`Too many images (${images}); maximum is ${IG_IMAGE_MAX}.`);
  }

  return r;
}

export function validateForFacebook(input: CrossPostInput): PlatformValidation {
  const r = base("facebook");
  const text = caption(input);
  const images = imageCount(input);

  if (text.length > FB_CAPTION_MAX) {
    r.ok = false;
    r.errors.push(`Caption exceeds ${FB_CAPTION_MAX} characters (${text.length}).`);
    r.fixes.push(truncateFix("facebook", "caption", FB_CAPTION_MAX, text));
  }

  if (images > FB_IMAGE_MAX) {
    r.ok = false;
    r.errors.push(`Too many images (${images}); maximum is ${FB_IMAGE_MAX}.`);
  }

  return r;
}

export function validateForThreads(input: CrossPostInput): PlatformValidation {
  const r = base("threads");
  const text = caption(input);
  const images = imageCount(input);

  if (text.length > THREADS_CAPTION_MAX) {
    r.ok = false;
    r.errors.push(
      `Caption exceeds ${THREADS_CAPTION_MAX} characters (${text.length}).`,
    );
    r.fixes.push(truncateFix("threads", "caption", THREADS_CAPTION_MAX, text));
  }

  if (images > THREADS_IMAGE_MAX) {
    r.ok = false;
    r.errors.push(`Too many images (${images}); maximum is ${THREADS_IMAGE_MAX}.`);
  }

  return r;
}

export function validateForLinkedIn(input: CrossPostInput): PlatformValidation {
  const r = base("linkedin");
  const text = caption(input);

  if (text.length > LINKEDIN_CAPTION_MAX) {
    r.ok = false;
    r.errors.push(
      `Caption exceeds ${LINKEDIN_CAPTION_MAX} characters (${text.length}).`,
    );
    r.fixes.push(
      truncateFix("linkedin", "caption", LINKEDIN_CAPTION_MAX, text),
    );
  }

  return r;
}

export function validateForRedNote(input: CrossPostInput): PlatformValidation {
  const r = base("rednote");
  const title = (input.title ?? "").trim();
  const body = caption(input);
  const images = imageCount(input);
  const video = hasVideo(input);

  if (!title) {
    r.warnings.push("RedNote 图文 posts work best with a title.");
  } else if (title.length > REDNOTE_TITLE_MAX) {
    r.ok = false;
    r.errors.push(`Title exceeds ${REDNOTE_TITLE_MAX} characters (${title.length}).`);
    r.fixes.push(truncateFix("rednote", "title", REDNOTE_TITLE_MAX, title));
  }

  if (body.length > REDNOTE_BODY_MAX) {
    r.ok = false;
    r.errors.push(`Body exceeds ${REDNOTE_BODY_MAX} characters (${body.length}).`);
    r.fixes.push(truncateFix("rednote", "caption", REDNOTE_BODY_MAX, body));
  }

  if (!hasImages(input) && !video) {
    r.ok = false;
    r.errors.push("RedNote 图文 requires at least one image (text-only not supported).");
    r.fixes.push({
      platform: "rednote",
      field: "media",
      action: "skip_platform",
      message: "Skip RedNote or add images",
    });
  }

  if (video) {
    r.warnings.push("RedNote video publishing uses a separate MCP tool.");
  }

  return r;
}

export function validateForWeChat(input: CrossPostInput): PlatformValidation {
  const r = base("wechat");
  const text = caption(input);
  const images = imageCount(input);
  const video = hasVideo(input);

  if (text.length > WECHAT_CAPTION_WARN) {
    r.warnings.push(
      `Caption is ${text.length} characters; WeChat Moments works best under ~${WECHAT_CAPTION_WARN}.`,
    );
    r.fixes.push(
      truncateFix("wechat", "caption", WECHAT_CAPTION_WARN, text),
    );
  }

  if (images > WECHAT_IMAGE_MAX) {
    r.ok = false;
    r.errors.push(`Too many images (${images}); maximum is ${WECHAT_IMAGE_MAX}.`);
  }

  if (video) {
    r.warnings.push("WeChat video is not supported in Phase 1; video will be skipped.");
    r.fixes.push({
      platform: "wechat",
      field: "media",
      action: "skip_platform",
      message: "Skip WeChat for video posts or remove video",
    });
  }

  return r;
}

const VALIDATORS: Record<
  CrossPostPlatform,
  (input: CrossPostInput) => PlatformValidation
> = {
  instagram: validateForInstagram,
  facebook: validateForFacebook,
  threads: validateForThreads,
  linkedin: validateForLinkedIn,
  rednote: validateForRedNote,
  wechat: validateForWeChat,
};

/** Validate input for one platform. */
export function validateForPlatform(
  platform: CrossPostPlatform,
  input: CrossPostInput,
): PlatformValidation {
  return VALIDATORS[platform](input);
}

/** Validate input for selected platforms and produce an overall result. */
export function validateCrossPost(
  input: CrossPostInput,
  platforms: CrossPostPlatform[],
): CrossPostValidation {
  const results = platforms.map((p) => validateForPlatform(p, input));
  return mergeResults(results);
}

/** Convenience: overall ok/errors/warnings/fixes without per-platform detail. */
export function summarizeValidation(
  result: CrossPostValidation,
): ValidationResult {
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    fixes: result.fixes,
  };
}
