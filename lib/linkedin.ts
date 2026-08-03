/**
 * LinkedIn API — OAuth helper layer.
 *
 * Docs: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication
 *
 * Flow:
 *  1. Redirect user to getAuthorizationUrl()
 *  2. LinkedIn redirects back with ?code=...
 *  3. exchangeCodeForToken() -> access + refresh tokens
 *  4. getProfile() -> member id for linkedin_member_urn
 */

const OAUTH_AUTHORIZE = "https://www.linkedin.com/oauth/v2/authorization";
const OAUTH_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com";

/** Permissions for posting on behalf of the member. */
export const LINKEDIN_SCOPES = [
  "openid",
  "profile",
  "w_member_social",
] as const;

function clientId() {
  const id = process.env.LINKEDIN_CLIENT_ID;
  if (!id) throw new Error("Missing LINKEDIN_CLIENT_ID env var");
  return id;
}

function clientSecret() {
  const secret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!secret) throw new Error("Missing LINKEDIN_CLIENT_SECRET env var");
  return secret;
}

/** The OAuth redirect URI registered in the LinkedIn developer portal. */
export function linkedInRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_APP_URL env var");
  return `${base.replace(/\/$/, "")}/api/linkedin/callback`;
}

/** Step 1 — URL we send the user to in order to authorize 9share. */
export function getLinkedInAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: linkedInRedirectUri(),
    scope: LINKEDIN_SCOPES.join(" "),
    state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
}

/** Step 3 — exchange the ?code for tokens. */
export async function exchangeLinkedInCodeForToken(
  code: string,
): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: linkedInRedirectUri(),
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `LinkedIn token exchange failed: ${data?.error_description || JSON.stringify(data)}`,
    );
  }
  return data as LinkedInTokenResponse;
}

/** Refresh an access token using a refresh token. */
export async function refreshLinkedInToken(
  refreshToken: string,
): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `LinkedIn token refresh failed: ${data?.error_description || JSON.stringify(data)}`,
    );
  }
  return data as LinkedInTokenResponse;
}

export interface LinkedInProfile {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
}

/** Fetch OpenID Connect userinfo for the connected member. */
export async function getLinkedInProfile(
  token: string,
): Promise<LinkedInProfile> {
  const res = await fetch(`${API}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`getLinkedInProfile failed: ${JSON.stringify(data)}`);
  }
  return data as LinkedInProfile;
}

/** Build the LinkedIn member URN used by the Posts API. */
export function linkedInMemberUrn(sub: string): string {
  return `urn:li:person:${sub}`;
}
