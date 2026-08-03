/**
 * Threads cross-post publishing via graph.threads.net.
 */

import type { CrossPostInput, PublishContext, PublishResult } from "../types";

const GRAPH = "https://graph.threads.net";
const GRAPH_VERSION = "v1.0";

function graphError(data: unknown): string {
  if (data && typeof data === "object") {
    const err = (data as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return JSON.stringify(data);
}

async function threadsPost(
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

async function threadsGet(
  path: string,
  token: string,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const params = new URLSearchParams({ access_token: token });
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/${path}?${params}`);
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

export interface ThreadsPublishCredentials {
  threadsUserId: string;
  accessToken: string;
}

/** Publish to Threads. */
export async function publishToThreads(
  ctx: PublishContext,
  creds: ThreadsPublishCredentials,
): Promise<PublishResult> {
  const { input, onProgress } = ctx;
  const text = (input.caption ?? "").trim();
  const { threadsUserId, accessToken: token } = creds;

  await onProgress?.(10);

  const video = videoUrl(input);
  const images = imageUrls(input);

  const containerBody: Record<string, string> = { text };

  if (video || input.media_type === "video") {
    if (!video) return { ok: false, error: "Video post missing video URL" };
    containerBody.media_type = "VIDEO";
    containerBody.video_url = video;
  } else if (images.length > 1) {
    containerBody.media_type = "CAROUSEL";
    images.forEach((url, i) => {
      containerBody[`children[${i}]`] = url;
    });
  } else if (images.length === 1) {
    containerBody.media_type = "IMAGE";
    containerBody.image_url = images[0];
  } else {
    containerBody.media_type = "TEXT";
  }

  await onProgress?.(30);
  const created = await threadsPost(
    `${threadsUserId}/threads`,
    containerBody,
    token,
  );
  if (!created.ok) return { ok: false, error: created.error, raw: created.data };

  const containerId = created.data?.id as string | undefined;
  if (!containerId) {
    return { ok: false, error: "Failed to create Threads container" };
  }

  // Poll until container is ready (best effort)
  for (let i = 0; i < 15; i++) {
    const status = await threadsGet(
      `${containerId}?fields=status,error_message`,
      token,
    );
    const st = status.data?.status as string | undefined;
    if (st === "FINISHED") break;
    if (st === "ERROR") {
      return {
        ok: false,
        error:
          (status.data?.error_message as string | undefined) ||
          "Threads container processing failed",
      };
    }
    await onProgress?.(40 + i * 2);
    await new Promise((r) => setTimeout(r, 2000));
  }

  await onProgress?.(80);
  const published = await threadsPost(
    `${threadsUserId}/threads_publish`,
    { creation_id: containerId },
    token,
  );
  if (!published.ok) {
    return { ok: false, error: published.error, raw: published.data };
  }

  const postId = published.data?.id as string | undefined;
  let permalink: string | undefined;
  if (postId) {
    const meta = await threadsGet(`${postId}?fields=permalink`, token);
    permalink = meta.data?.permalink as string | undefined;
  }

  await onProgress?.(100);
  return {
    ok: true,
    external_post_id: postId,
    permalink,
    raw: published.data,
  };
}
