/**
 * WeChat Moments publishing via MCP.
 *
 * Passes HTTPS image URLs to the MCP server (HTTP URLs are forwarded as-is
 * when the source only provides them).
 */

import { preparePost, submitPost } from "../mcp/wechat";
import type { CrossPostInput, PublishContext, PublishResult } from "../types";

function imageUrls(input: CrossPostInput): string[] {
  return input.media
    .filter((m) => (m.mime ?? "").startsWith("image/") || !m.mime)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m) => m.public_url)
    .slice(0, 9);
}

function hasVideo(input: CrossPostInput): boolean {
  return (
    input.media_type === "video" ||
    input.media.some((m) => (m.mime ?? "").startsWith("video/"))
  );
}

/** Publish to WeChat Moments via MCP. */
export async function publishToWeChat(
  ctx: PublishContext,
): Promise<PublishResult> {
  const { input, onProgress } = ctx;
  const text = (input.caption ?? "").trim();
  const images = imageUrls(input);

  if (hasVideo(input)) {
    return {
      ok: false,
      skipped: true,
      error: "WeChat video is not supported in Phase 1",
    };
  }

  await onProgress?.(15);

  const prepared = await preparePost({
    text,
    images: images.length > 0 ? images : undefined,
  });
  if (!prepared.ok || !prepared.post_id) {
    return {
      ok: false,
      error: prepared.error || "WeChat prepare_post failed (missing post_id)",
    };
  }

  await onProgress?.(50);

  const submitted = await submitPost({
    post_id: prepared.post_id,
  });
  await onProgress?.(90);

  if (!submitted.ok) {
    return { ok: false, error: submitted.error, raw: submitted.raw };
  }

  await onProgress?.(100);
  return {
    ok: true,
    external_post_id: submitted.post_id,
    raw: submitted.raw,
  };
}
