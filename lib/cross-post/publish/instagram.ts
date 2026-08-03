/**
 * Instagram Content Publishing via graph.instagram.com.
 *
 * Requires instagram_business_content_publish scope on the connected account.
 */

import type { CrossPostInput, PublishContext, PublishResult } from "../types";

const GRAPH = "https://graph.instagram.com";
const GRAPH_VERSION = "v23.0";

function graphError(data: unknown): string {
  if (data && typeof data === "object") {
    const err = (data as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return JSON.stringify(data);
}

async function igGet(
  path: string,
  token: string,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const params = new URLSearchParams({ access_token: token });
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/${path}?${params}`);
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: graphError(data) };
  return { ok: true, data };
}

async function igPost(
  path: string,
  body: Record<string, string>,
  token: string,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const params = new URLSearchParams({ ...body, access_token: token });
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    body: params,
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: graphError(data) };
  return { ok: true, data };
}

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

async function waitForContainer(
  containerId: string,
  token: string,
  onProgress?: (p: number) => Promise<void>,
): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i < 30; i++) {
    const check = await igGet(`${containerId}?fields=status_code`, token);
    if (!check.ok) return { ok: false, error: check.error };
    const status = check.data?.status_code as string | undefined;
    await onProgress?.(60 + i);
    if (status === "FINISHED") return { ok: true };
    if (status === "ERROR") {
      return { ok: false, error: "Instagram media container failed processing" };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, error: "Instagram media container timed out" };
}

export interface InstagramPublishCredentials {
  igUserId: string;
  accessToken: string;
}

/** Publish to Instagram via Content Publishing API. */
export async function publishToInstagram(
  ctx: PublishContext,
  creds: InstagramPublishCredentials,
): Promise<PublishResult> {
  const { input, onProgress } = ctx;
  const caption = (input.caption ?? "").trim();
  const { igUserId, accessToken: token } = creds;

  await onProgress?.(10);

  const video = videoUrl(input);
  const images = imageUrls(input);

  let containerId: string | undefined;

  if (video || input.media_type === "video") {
    if (!video) return { ok: false, error: "Video post missing video URL" };
    await onProgress?.(25);
    const created = await igPost(`${igUserId}/media`, {
      media_type: "REELS",
      video_url: video,
      caption,
    }, token);
    if (!created.ok) return { ok: false, error: created.error, raw: created.data };
    containerId = created.data?.id as string | undefined;
  } else if (images.length > 1 || input.media_type === "carousel") {
    await onProgress?.(20);
    const childIds: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const child = await igPost(`${igUserId}/media`, {
        image_url: images[i],
        is_carousel_item: "true",
      }, token);
      if (!child.ok) {
        return { ok: false, error: child.error || `Carousel item ${i + 1} failed` };
      }
      const id = child.data?.id as string | undefined;
      if (id) childIds.push(id);
      await onProgress?.(20 + Math.round((i / images.length) * 20));
    }
    const carousel = await igPost(`${igUserId}/media`, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
    }, token);
    if (!carousel.ok) return { ok: false, error: carousel.error, raw: carousel.data };
    containerId = carousel.data?.id as string | undefined;
  } else if (images.length === 1) {
    await onProgress?.(25);
    const created = await igPost(`${igUserId}/media`, {
      image_url: images[0],
      caption,
    }, token);
    if (!created.ok) return { ok: false, error: created.error, raw: created.data };
    containerId = created.data?.id as string | undefined;
  } else {
    return { ok: false, error: "Instagram requires image or video media" };
  }

  if (!containerId) {
    return { ok: false, error: "Failed to create Instagram media container" };
  }

  await onProgress?.(50);
  const ready = await waitForContainer(containerId, token, onProgress);
  if (!ready.ok) return { ok: false, error: ready.error };

  await onProgress?.(85);
  const published = await igPost(`${igUserId}/media_publish`, {
    creation_id: containerId,
  }, token);
  if (!published.ok) {
    return { ok: false, error: published.error, raw: published.data };
  }

  const mediaId = published.data?.id as string | undefined;
  let permalink: string | undefined;
  if (mediaId) {
    const meta = await igGet(`${mediaId}?fields=permalink`, token);
    permalink = meta.data?.permalink as string | undefined;
  }

  await onProgress?.(100);
  return {
    ok: true,
    external_post_id: mediaId,
    permalink,
    raw: published.data,
  };
}
