/** Supported cross-post destination platforms. */
export type CrossPostPlatform =
  | "facebook"
  | "instagram"
  | "threads"
  | "linkedin"
  | "rednote"
  | "wechat";

export const CROSS_POST_PLATFORMS: readonly CrossPostPlatform[] = [
  "facebook",
  "instagram",
  "threads",
  "linkedin",
  "rednote",
  "wechat",
] as const;

export type CrossPostMediaType = "image" | "carousel" | "video";

export type CrossPostStatus =
  | "draft"
  | "scheduled"
  | "processing"
  | "completed"
  | "partial"
  | "failed";

export type TargetStatus =
  | "queued"
  | "validating"
  | "uploading"
  | "publishing"
  | "success"
  | "failed"
  | "skipped";

/** One media asset attached to a cross-post. */
export interface CrossPostMediaItem {
  id?: string;
  storage_path?: string | null;
  public_url: string;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
  duration_sec?: number | null;
  sort_order?: number;
}

/** Input payload used for validation and publishing. */
export interface CrossPostInput {
  caption?: string | null;
  title?: string | null;
  tags?: string[] | null;
  media_type: CrossPostMediaType;
  media: CrossPostMediaItem[];
}

/** Suggested auto-fix for validation issues. */
export interface ValidationFix {
  platform: CrossPostPlatform;
  field: string;
  action: "truncate" | "remove" | "skip_platform" | "convert";
  message: string;
  /** Suggested replacement value when applicable. */
  value?: string;
}

/** Per-platform or overall validation outcome. */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  fixes: ValidationFix[];
}

export interface PlatformValidation extends ValidationResult {
  platform: CrossPostPlatform;
}

export interface CrossPostValidation extends ValidationResult {
  platforms: PlatformValidation[];
}

/** Result returned by each platform publish adapter. */
export interface PublishResult {
  ok: boolean;
  external_post_id?: string;
  permalink?: string;
  error?: string;
  skipped?: boolean;
  raw?: unknown;
}

/** Context passed to publish adapters from the runner. */
export interface PublishContext {
  postId: string;
  targetId: string;
  userId: string;
  /** Row id (uuid) in the platform account table, or mcp_connections id. */
  accountRef: string;
  input: CrossPostInput;
  onProgress?: (progress: number) => Promise<void>;
}

export function isImageMime(mime?: string | null): boolean {
  return !!mime && mime.startsWith("image/");
}

export function isVideoMime(mime?: string | null): boolean {
  return !!mime && mime.startsWith("video/");
}
