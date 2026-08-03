/**
 * Instagram API with Instagram Login — helper layer.
 *
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 *
 * Flow:
 *  1. Redirect user to getAuthorizationUrl()
 *  2. Instagram redirects back with ?code=...
 *  3. exchangeCodeForToken() -> short-lived token + user_id
 *  4. getLongLivedToken() -> 60-day token
 *  5. subscribeToWebhooks() -> start receiving "comments" events
 *  6. On a comment webhook -> sendPrivateReply() to DM the commenter
 */

const GRAPH = "https://graph.instagram.com";
const GRAPH_VERSION = "v23.0";
const OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const OAUTH_TOKEN = "https://api.instagram.com/oauth/access_token";

/** Permissions 9share needs for comment automation + DMs + cross-post. */
export const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
] as const;

function appId() {
  const id = process.env.INSTAGRAM_APP_ID;
  if (!id) throw new Error("Missing INSTAGRAM_APP_ID env var");
  return id;
}

function appSecret() {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) throw new Error("Missing INSTAGRAM_APP_SECRET env var");
  return secret;
}

/** The OAuth redirect URI registered in the Meta App dashboard. */
export function redirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_APP_URL env var");
  return `${base.replace(/\/$/, "")}/api/instagram/callback`;
}

/** Step 1 — URL we send the user to in order to authorize 9share. */
export function getAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

export interface ShortLivedToken {
  access_token: string;
  user_id: number;
  permissions?: string[];
}

/** Step 3 — exchange the ?code for a short-lived access token. */
export async function exchangeCodeForToken(
  code: string,
): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code,
  });

  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Token exchange failed: ${data.error_message || JSON.stringify(data)}`,
    );
  }
  return data as ShortLivedToken;
}

export interface LongLivedToken {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (~60 days)
}

/** Step 4 — upgrade the short-lived token to a 60-day long-lived token. */
export async function getLongLivedToken(
  shortLivedToken: string,
): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret(),
    access_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH}/access_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Long-lived token exchange failed: ${JSON.stringify(data)}`,
    );
  }
  return data as LongLivedToken;
}

/** Refresh a long-lived token (call when it's within ~a week of expiring). */
export async function refreshLongLivedToken(
  token: string,
): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/refresh_access_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data as LongLivedToken;
}

export interface IgProfile {
  user_id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

/** Fetch the connected account's profile. */
export async function getProfile(token: string): Promise<IgProfile> {
  const params = new URLSearchParams({
    fields: "user_id,username,name,profile_picture_url",
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/me?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`getProfile failed: ${JSON.stringify(data)}`);
  return data as IgProfile;
}

export interface IgMedia {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  comments_count?: number;
  like_count?: number;
}

export interface IgMediaPage {
  data: IgMedia[];
  after?: string;
}

/** List one page of the connected account's posts/reels. */
export async function getMediaPage(
  token: string,
  limit = 25,
  after?: string | null,
): Promise<IgMediaPage> {
  const params = new URLSearchParams({
    fields:
      "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count",
    limit: String(limit),
    access_token: token,
  });
  if (after) params.set("after", after);

  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/me/media?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`getMedia failed: ${JSON.stringify(data)}`);
  return {
    data: (data.data ?? []) as IgMedia[],
    after: data.paging?.cursors?.after,
  };
}

/** List the connected account's first page of posts/reels. */
export async function getMedia(
  token: string,
  limit = 25,
): Promise<IgMedia[]> {
  const page = await getMediaPage(token, limit);
  return page.data;
}

/**
 * Step 5 — subscribe this account to the "comments" webhook field so Instagram
 * starts POSTing comment events to our callback URL.
 */
export async function subscribeToWebhooks(token: string): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: "comments",
    access_token: token,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/me/subscribed_apps?${params.toString()}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`subscribeToWebhooks failed: ${JSON.stringify(data)}`);
  }
}

/**
 * Step 6 — send a private reply DM to whoever made a comment.
 * `recipient.comment_id` targets the commenter; allowed once per comment.
 */
export async function sendPrivateReply(
  igUserId: string,
  commentId: string,
  text: string,
  token: string,
): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/${igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
      access_token: token,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error?.message || JSON.stringify(data),
      raw: data,
    };
  }
  return { ok: true, raw: data };
}

/** Reply publicly to a comment (optional — e.g. "Check your DMs! 💌"). */
export async function replyToComment(
  commentId: string,
  message: string,
  token: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const params = new URLSearchParams({ message, access_token: token });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${commentId}/replies?${params.toString()}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: graphErrorMessage(data) };
  }
  return { ok: true, id: typeof data.id === "string" ? data.id : undefined };
}

export interface IgComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  hidden?: boolean;
  like_count?: number;
  from?: { id?: string; username?: string };
}

function graphErrorMessage(data: unknown): string {
  if (data && typeof data === "object") {
    const err = (data as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return JSON.stringify(data);
}

/** List comments on an IG Media object. */
export async function getMediaComments(
  mediaId: string,
  token: string,
): Promise<IgComment[]> {
  const params = new URLSearchParams({
    fields: "id,text,username,timestamp,hidden,like_count,from",
    access_token: token,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${mediaId}/comments?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`getMediaComments failed: ${graphErrorMessage(data)}`);
  }
  return (data.data ?? []) as IgComment[];
}

/** List replies under an IG Comment (used to find our public reply id). */
export async function getCommentReplies(
  commentId: string,
  token: string,
): Promise<IgComment[]> {
  const params = new URLSearchParams({
    fields: "id,text,username,timestamp,from",
    access_token: token,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${commentId}/replies?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`getCommentReplies failed: ${graphErrorMessage(data)}`);
  }
  return (data.data ?? []) as IgComment[];
}

/** Fresh thumbnail/media URL for a media id (CDN links in DB often expire). */
export async function getMediaThumbnail(
  mediaId: string,
  token: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    fields: "thumbnail_url,media_url",
    access_token: token,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${mediaId}?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) return null;
  return (data.thumbnail_url || data.media_url || null) as string | null;
}

/** Post a top-level comment on an IG Media object (as the connected account). */
export async function createMediaComment(
  mediaId: string,
  message: string,
  token: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const params = new URLSearchParams({ message, access_token: token });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${mediaId}/comments?${params.toString()}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: graphErrorMessage(data) };
  }
  return { ok: true, id: data.id as string | undefined };
}

/**
 * Instagram Graph does not support editing comment text (POST /{id} only
 * accepts `hide`). Replace by posting a new top-level comment, then deleting
 * the old one. Rolls back the new comment if delete fails.
 */
export async function replaceMediaComment(
  mediaId: string,
  oldCommentId: string,
  message: string,
  token: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const created = await createMediaComment(mediaId, message, token);
  if (!created.ok || !created.id) {
    return {
      ok: false,
      error: created.error || "Failed to post updated comment",
    };
  }

  const deleted = await deleteComment(oldCommentId, token);
  if (!deleted.ok) {
    await deleteComment(created.id, token);
    return {
      ok: false,
      error: deleted.error || "Failed to replace comment",
    };
  }

  return { ok: true, id: created.id };
}

/**
 * Same replace strategy for a public reply under someone else's comment.
 */
export async function replaceCommentReply(
  parentCommentId: string,
  oldReplyId: string,
  message: string,
  token: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const created = await replyToComment(parentCommentId, message, token);
  if (!created.ok || !created.id) {
    return {
      ok: false,
      error: created.error || "Failed to post updated reply",
    };
  }

  const deleted = await deleteComment(oldReplyId, token);
  if (!deleted.ok) {
    await deleteComment(created.id, token);
    return {
      ok: false,
      error: deleted.error || "Failed to replace reply",
    };
  }

  return { ok: true, id: created.id };
}

/** Delete a comment on media owned by the connected account. */
export async function deleteComment(
  commentId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({ access_token: token });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${commentId}?${params.toString()}`,
    { method: "DELETE" },
  );
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: graphErrorMessage(data) };
  }
  return { ok: true };
}

