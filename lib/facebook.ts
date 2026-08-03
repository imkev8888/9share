/**
 * Facebook Pages API — helper layer.
 *
 * Docs:
 *  - Login:           https://developers.facebook.com/docs/facebook-login/
 *  - Pages:           https://developers.facebook.com/docs/pages-api/
 *  - Private Replies: https://developers.facebook.com/docs/messenger-platform/discovery/private-replies/
 *
 * Flow:
 *  1. Redirect user to getAuthorizationUrl()
 *  2. Facebook redirects back with ?code=...
 *  3. exchangeCodeForToken() -> short-lived USER token
 *  4. getLongLivedUserToken() -> ~60-day USER token
 *  5. getPages() -> Pages the user manages, each with a long-lived PAGE token
 *     (Page tokens derived from a long-lived user token do not expire)
 *  6. subscribePageToWebhooks() -> start receiving "feed" events for the Page
 *  7. On a comment webhook -> sendPrivateReply() to Messenger the commenter
 */

const GRAPH = "https://graph.facebook.com";
const GRAPH_VERSION = "v23.0";
const OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

/** Permissions 9share needs for Page comment automation + private replies. */
export const FB_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_messaging",
  "pages_manage_engagement",
] as const;

function appId() {
  const id = process.env.FACEBOOK_APP_ID;
  if (!id) throw new Error("Missing FACEBOOK_APP_ID env var");
  return id;
}

function appSecret() {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret) throw new Error("Missing FACEBOOK_APP_SECRET env var");
  return secret;
}

/** The OAuth redirect URI registered in the Meta App dashboard. */
export function fbRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_APP_URL env var");
  return `${base.replace(/\/$/, "")}/api/facebook/callback`;
}

/** Step 1 — URL we send the user to in order to authorize 9share. */
export function getFacebookAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: fbRedirectUri(),
    response_type: "code",
    scope: FB_SCOPES.join(","),
    state,
  });
  return `${OAUTH_DIALOG}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/** Step 3 — exchange the ?code for a short-lived USER access token. */
export async function exchangeFacebookCodeForToken(
  code: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    redirect_uri: fbRedirectUri(),
    code,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/oauth/access_token?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Facebook token exchange failed: ${data?.error?.message || JSON.stringify(data)}`,
    );
  }
  return data as TokenResponse;
}

/** Step 4 — upgrade the short-lived user token to a ~60-day one. */
export async function getLongLivedUserToken(
  shortLivedToken: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId(),
    client_secret: appSecret(),
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/oauth/access_token?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Long-lived user token exchange failed: ${data?.error?.message || JSON.stringify(data)}`,
    );
  }
  return data as TokenResponse;
}

export interface FbPage {
  id: string;
  name: string;
  access_token: string;
  picture_url?: string;
}

/**
 * Step 5 — list every Page the user manages, each with its own Page access
 * token. With a long-lived user token these Page tokens do not expire.
 */
export async function getPages(userToken: string): Promise<FbPage[]> {
  const pages: FbPage[] = [];
  let url =
    `${GRAPH}/${GRAPH_VERSION}/me/accounts?` +
    new URLSearchParams({
      fields: "id,name,access_token,picture{url}",
      limit: "100",
      access_token: userToken,
    }).toString();

  // Follow pagination — a user can manage many Pages.
  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        `getPages failed: ${data?.error?.message || JSON.stringify(data)}`,
      );
    }
    for (const p of data.data ?? []) {
      pages.push({
        id: p.id,
        name: p.name,
        access_token: p.access_token,
        picture_url: p.picture?.data?.url,
      });
    }
    url = data.paging?.next ?? "";
  }
  return pages;
}

export interface FbPost {
  id: string;
  message?: string;
  full_picture?: string;
  permalink_url?: string;
  created_time: string;
}

export interface FbPostPage {
  data: FbPost[];
  after?: string;
}

/** List one page of a Facebook Page's published posts. */
export async function getPagePostsPage(
  pageId: string,
  pageToken: string,
  limit = 25,
  after?: string | null,
): Promise<FbPostPage> {
  const params = new URLSearchParams({
    fields: "id,message,full_picture,permalink_url,created_time",
    limit: String(limit),
    access_token: pageToken,
  });
  if (after) params.set("after", after);

  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${pageId}/posts?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `getPagePosts failed: ${data?.error?.message || JSON.stringify(data)}`,
    );
  }
  return {
    data: (data.data ?? []) as FbPost[],
    after: data.paging?.cursors?.after,
  };
}

/**
 * Step 6 — install the app on the Page and subscribe to the "feed" webhook
 * field so Meta starts POSTing comment events to our callback URL.
 */
export async function subscribePageToWebhooks(
  pageId: string,
  pageToken: string,
): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: "feed",
    access_token: pageToken,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${pageId}/subscribed_apps?${params.toString()}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `subscribePageToWebhooks failed: ${data?.error?.message || JSON.stringify(data)}`,
    );
  }
}

/** Uninstall the app from a Page (used on disconnect — best effort). */
export async function unsubscribePageFromWebhooks(
  pageId: string,
  pageToken: string,
): Promise<void> {
  const params = new URLSearchParams({ access_token: pageToken });
  await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${pageId}/subscribed_apps?${params.toString()}`,
    { method: "DELETE" },
  ).catch(() => {});
}

/**
 * Step 7 — send a Private Reply (Messenger DM) to whoever made a comment.
 * `recipient.comment_id` targets the commenter; allowed once per comment,
 * within 7 days of the comment.
 */
export async function sendFacebookPrivateReply(
  pageId: string,
  commentId: string,
  text: string,
  pageToken: string,
): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
      access_token: pageToken,
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

/** Reply publicly under a comment (optional — e.g. "Check your Messenger!"). */
export async function replyToFacebookComment(
  commentId: string,
  message: string,
  pageToken: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const params = new URLSearchParams({ message, access_token: pageToken });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${commentId}/comments?${params.toString()}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || JSON.stringify(data) };
  }
  return { ok: true, id: typeof data.id === "string" ? data.id : undefined };
}

/** Post a top-level comment on a Page post. */
export async function createFacebookComment(
  postId: string,
  message: string,
  pageToken: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const params = new URLSearchParams({ message, access_token: pageToken });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${postId}/comments?${params.toString()}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || JSON.stringify(data) };
  }
  return { ok: true, id: typeof data.id === "string" ? data.id : undefined };
}

/** Edit a Page comment we posted. */
export async function editFacebookComment(
  commentId: string,
  message: string,
  pageToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({ message, access_token: pageToken });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${commentId}?${params.toString()}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || JSON.stringify(data) };
  }
  return { ok: true };
}

/** Delete a Page comment. */
export async function deleteFacebookComment(
  commentId: string,
  pageToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({ access_token: pageToken });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/${commentId}?${params.toString()}`,
    { method: "DELETE" },
  );
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || JSON.stringify(data) };
  }
  return { ok: true };
}
