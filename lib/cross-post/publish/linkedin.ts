/**
 * LinkedIn Posts API publishing.
 *
 * Uses /rest/posts with w_member_social. Images uploaded via the Images API
 * when media is present; otherwise a text-only post.
 */

import type { CrossPostInput, PublishContext, PublishResult } from "../types";

const API = "https://api.linkedin.com";

function liError(data: unknown): string {
  if (data && typeof data === "object") {
    const d = data as {
      message?: string;
      errorDetailType?: string;
      status?: number;
    };
    if (d.message) return d.message;
  }
  return JSON.stringify(data);
}

function imageUrls(input: CrossPostInput): string[] {
  return input.media
    .filter((m) => (m.mime ?? "").startsWith("image/") || !m.mime)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m) => m.public_url);
}

async function registerImageUpload(
  authorUrn: string,
  token: string,
): Promise<{
  ok: boolean;
  uploadUrl?: string;
  imageUrn?: string;
  error?: string;
}> {
  const res = await fetch(`${API}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202501",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
      },
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: liError(data) };

  const value = data.value as Record<string, unknown> | undefined;
  return {
    ok: true,
    uploadUrl: value?.uploadUrl as string | undefined,
    imageUrn: value?.image as string | undefined,
  };
}

async function uploadImageFromUrl(
  uploadUrl: string,
  imageUrl: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    return { ok: false, error: `Failed to fetch image: HTTP ${imgRes.status}` };
  }
  const buf = await imgRes.arrayBuffer();
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": imgRes.headers.get("content-type") || "application/octet-stream",
    },
    body: buf,
  });
  if (!res.ok) {
    return { ok: false, error: `LinkedIn image upload failed: HTTP ${res.status}` };
  }
  return { ok: true };
}

export interface LinkedInPublishCredentials {
  memberUrn: string;
  accessToken: string;
}

/** Publish to LinkedIn. */
export async function publishToLinkedIn(
  ctx: PublishContext,
  creds: LinkedInPublishCredentials,
): Promise<PublishResult> {
  const { input, onProgress } = ctx;
  const commentary = (input.caption ?? "").trim();
  const { memberUrn: authorUrn, accessToken: token } = creds;
  const urls = imageUrls(input);

  await onProgress?.(10);

  const imageUrns: string[] = [];

  if (urls.length > 0) {
    for (let i = 0; i < urls.length; i++) {
      const reg = await registerImageUpload(authorUrn, token);
      if (!reg.ok || !reg.uploadUrl || !reg.imageUrn) {
        return { ok: false, error: reg.error || "Image upload registration failed" };
      }
      const up = await uploadImageFromUrl(reg.uploadUrl, urls[i], token);
      if (!up.ok) return { ok: false, error: up.error };
      imageUrns.push(reg.imageUrn);
      await onProgress?.(10 + Math.round(((i + 1) / urls.length) * 50));
    }
  }

  await onProgress?.(70);

  const postBody: Record<string, unknown> = {
    author: authorUrn,
    commentary,
    visibility: "PUBLIC",
    lifecycleState: "PUBLISHED",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
  };

  if (imageUrns.length === 1) {
    postBody.content = {
      media: {
        title: input.title || "",
        id: imageUrns[0],
      },
    };
  } else if (imageUrns.length > 1) {
    postBody.content = {
      multiImage: {
        images: imageUrns.map((id) => ({ id, altText: "" })),
      },
    };
  }

  const res = await fetch(`${API}/rest/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202501",
    },
    body: JSON.stringify(postBody),
  });

  const postId = res.headers.get("x-restli-id") ?? undefined;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 201 Created may have empty body
  }

  await onProgress?.(95);

  if (!res.ok) {
    return { ok: false, error: liError(data), raw: data };
  }

  await onProgress?.(100);
  return {
    ok: true,
    external_post_id: postId,
    permalink: postId
      ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}`
      : undefined,
    raw: data,
  };
}
