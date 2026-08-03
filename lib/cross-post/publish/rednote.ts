/**
 * RedNote (Xiaohongshu) publishing via MCP.
 */

import { publishContent, publishWithVideo } from "../mcp/xhs";
import type { CrossPostInput, PublishContext, PublishResult } from "../types";

function imageUrls(input: CrossPostInput): string[] {
  return input.media
    .filter((m) => (m.mime ?? "").startsWith("image/") || !m.mime)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m) => m.public_url);
}

function videoUrl(input: CrossPostInput): string | null {
  const v = input.media.find((m) => (m.mime ?? "").startsWith("video/"));
  return v?.public_url ?? null;
}

/** Publish to RedNote via XHS MCP server. */
export async function publishToRedNote(
  ctx: PublishContext,
): Promise<PublishResult> {
  const { input, onProgress } = ctx;
  const title = (input.title ?? "").trim();
  const content = (input.caption ?? "").trim();
  const tags = input.tags ?? [];
  const video = videoUrl(input);
  const images = imageUrls(input);

  await onProgress?.(10);

  if (video || input.media_type === "video") {
    if (!video) return { ok: false, error: "Video post missing video URL" };
    await onProgress?.(30);
    const res = await publishWithVideo({
      title: title || content.slice(0, 20),
      content,
      tags,
      video,
      images: images.length > 0 ? images : undefined,
    });
    await onProgress?.(90);
    if (!res.ok) return { ok: false, error: res.error, raw: res.raw };
    return {
      ok: true,
      external_post_id: res.post_id,
      permalink: res.permalink,
      raw: res.raw,
    };
  }

  if (images.length === 0) {
    return { ok: false, error: "RedNote requires at least one image" };
  }

  await onProgress?.(30);
  const res = await publishContent({
    title: title || content.slice(0, 20),
    content,
    tags,
    images,
  });
  await onProgress?.(90);

  if (!res.ok) return { ok: false, error: res.error, raw: res.raw };
  return {
    ok: true,
    external_post_id: res.post_id,
    permalink: res.permalink,
    raw: res.raw,
  };
}
