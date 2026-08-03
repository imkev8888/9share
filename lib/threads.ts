/**
 * Threads API — OAuth helper layer.
 *
 * Docs: https://developers.facebook.com/docs/threads
 *
 * Uses Meta app credentials (THREADS_APP_ID/SECRET) or falls back to
 * INSTAGRAM_APP_ID/SECRET when running a unified Meta app.
 *
 * Flow:
 *  1. Redirect user to getAuthorizationUrl()
 *  2. Threads redirects back with ?code=...
 *  3. exchangeCodeForToken() -> short-lived token
 *  4. getLongLivedToken() -> long-lived token
 */

const GRAPH = "https://graph.threads.net";
const GRAPH_VERSION = "v1.0";
const OAUTH_AUTHORIZE = "https://threads.net/oauth/authorize";
const OAUTH_TOKEN = "https://graph.threads.net/oauth/access_token";

/** Permissions for Threads content publishing. */
export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
] as const;

function appId() {
  const id = process.env.THREADS_APP_ID || process.env.INSTAGRAM_APP_ID;
  if (!id) {
    throw new Error("Missing THREADS_APP_ID or INSTAGRAM_APP_ID env var");
  }
  return id;
}

function appSecret() {
  const secret =
    process.env.THREADS_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  if (!secret) {
    throw new Error(
      "Missing THREADS_APP_SECRET or INSTAGRAM_APP_SECRET env var",
    );
  }
  return secret;
}

/** The OAuth redirect URI registered in the Meta App dashboard. */
export function threadsRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_APP_URL env var");
  return `${base.replace(/\/$/, "")}/api/threads/callback`;
}

/** Step 1 — URL we send the user to in order to authorize 9share. */
export function getThreadsAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: threadsRedirectUri(),
    scope: THREADS_SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

export interface ThreadsShortLivedToken {
  access_token: string;
  user_id: number;
}

/** Step 3 — exchange the ?code for a short-lived access token. */
export async function exchangeThreadsCodeForToken(
  code: string,
): Promise<ThreadsShortLivedToken> {
  const params = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    grant_type: "authorization_code",
    redirect_uri: threadsRedirectUri(),
    code,
  });
  const res = await fetch(`${OAUTH_TOKEN}?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Threads token exchange failed: ${data?.error_message || JSON.stringify(data)}`,
    );
  }
  return data as ThreadsShortLivedToken;
}

export interface ThreadsLongLivedToken {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/** Step 4 — upgrade to a long-lived token (~60 days). */
export async function getThreadsLongLivedToken(
  shortLivedToken: string,
): Promise<ThreadsLongLivedToken> {
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: appSecret(),
    access_token: shortLivedToken,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/access_token?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Threads long-lived token exchange failed: ${JSON.stringify(data)}`,
    );
  }
  return data as ThreadsLongLivedToken;
}

/** Refresh a long-lived Threads token. */
export async function refreshThreadsLongLivedToken(
  token: string,
): Promise<ThreadsLongLivedToken> {
  const params = new URLSearchParams({
    grant_type: "th_refresh_token",
    access_token: token,
  });
  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/refresh_access_token?${params.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Threads token refresh failed: ${JSON.stringify(data)}`);
  }
  return data as ThreadsLongLivedToken;
}

export interface ThreadsProfile {
  id: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
}

/** Fetch the connected Threads account profile. */
export async function getThreadsProfile(
  token: string,
): Promise<ThreadsProfile> {
  const params = new URLSearchParams({
    fields: "id,username,name,threads_profile_picture_url",
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/me?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`getThreadsProfile failed: ${JSON.stringify(data)}`);
  }
  return data as ThreadsProfile;
}
