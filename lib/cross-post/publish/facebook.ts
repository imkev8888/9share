/**
 * Facebook Page cross-post publishing via Graph API v23.0.
 */

import type { CrossPostInput, PublishContext, PublishResult } from "../types";

const GRAPH = "https://graph.facebook.com";
const GRAPH_VERSION = "v23.0";

function graphError(data: unknown): string {
  if (data && typeof data === "object") {
    const err = (data as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return JSON.stringify(data);
}

async function graphPost(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const body = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    body,
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

export interface FacebookPublishCredentials {
  pageId: string;
  pageAccessToken: string;
}

/** Publish to a Facebook Page. */
export async function publishToFacebook(
  ctx: PublishContext,
  creds: FacebookPublishCredentials,
): Promise<PublishResult> {
  const { input, onProgress } = ctx;
  const message = (input.caption ?? "").trim();
  const { pageId, pageAccessToken: token } = creds;

  await onProgress?.(10);

  const video = videoUrl(input);
  if (video || input.media_type === "video") {
    if (!video) {
      return { ok: false, error: "Video post missing video URL" };
    }
    await onProgress?.(40);
    const res = await graphPost(`${pageId}/videos`, {
      file_url: video,
      description: message,
      access_token: token,
    });
    await onProgress?.(90);
    if (!res.ok) return { ok: false, error: res.error, raw: res.data };
    return {
      ok: true,
      external_post_id: res.data?.id as string | undefined,
      permalink: res.data?.permalink_url as string | undefined,
      raw: res.data,
    };
  }

  const urls = imageUrls(input);

  if (urls.length === 0) {
    // Text-only feed post
    await onProgress?.(50);
    const res = await graphPost(`${pageId}/feed`, {
      message,
      access_token: token,
    });
    await onProgress?.(90);
    if (!res.ok) return { ok: false, error: res.error, raw: res.data };
    return {
      ok: true,
      external_post_id: res.data?.id as string | undefined,
      raw: res.data,
    };
  }

  if (urls.length === 1) {
    await onProgress?.(50);
    const res = await graphPost(`${pageId}/photos`, {
      url: urls[0],
      caption: message,
      access_token: token,
    });
    await onProgress?.(90);
    if (!res.ok) return { ok: false, error: res.error, raw: res.data };
    return {
      ok: true,
      external_post_id: res.data?.post_id as string | undefined,
      raw: res.data,
    };
  }

  // Multi-image: upload unpublished photos, attach to feed post
  await onProgress?.(20);
  const mediaFbids: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const res = await graphPost(`${pageId}/photos`, {
      url: urls[i],
      published: "false",
      access_token: token,
    });
    if (!res.ok) {
      return { ok: false, error: res.error || `Photo upload ${i + 1} failed` };
    }
    const id = res.data?.id as string | undefined;
    if (id) mediaFbids.push(id);
    await onProgress?.(20 + Math.round((i / urls.length) * 50));
  }

  const attached = mediaFbids.map((id) =>
    JSON.stringify({ media_fbid: id }),
  );
  const feedParams: Record<string, string> = {
    message,
    access_token: token,
  };
  attached.forEach((val, idx) => {
    feedParams[`attached_media[${idx}]`] = val;
  });

  await onProgress?.(80);
  const feed = await graphPost(`${pageId}/feed`, feedParams);
  await onProgress?.(95);
  if (!feed.ok) return { ok: false, error: feed.error, raw: feed.data };
  return {
    ok: true,
    external_post_id: feed.data?.id as string | undefined,
    raw: feed.data,
  };
}
