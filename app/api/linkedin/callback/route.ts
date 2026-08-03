import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeLinkedInCodeForToken,
  getLinkedInProfile,
  linkedInMemberUrn,
} from "@/lib/linkedin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** OAuth redirect target for LinkedIn. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(
        `/dashboard/channels?connect=error&reason=${encodeURIComponent(reason)}`,
        appUrl,
      ),
    );

  if (error) return fail(url.searchParams.get("error_description") || error);
  if (!code) return fail("missing_code");

  const cookieState = request.cookies.get("linkedin_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return fail("invalid_state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl));

  try {
    const tokens = await exchangeLinkedInCodeForToken(code);
    const profile = await getLinkedInProfile(tokens.access_token);
    const memberUrn = linkedInMemberUrn(profile.sub);

    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000,
    ).toISOString();

    const admin = createAdminClient();
    const { error: upsertError } = await admin.from("linkedin_accounts").upsert(
      {
        user_id: user.id,
        linkedin_member_urn: memberUrn,
        name: profile.name ?? null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expires_at: expiresAt,
      },
      { onConflict: "linkedin_member_urn" },
    );

    if (upsertError) return fail(upsertError.message);

    const res = NextResponse.redirect(
      new URL("/dashboard/channels?connect=linkedin_success", appUrl),
    );
    res.cookies.delete("linkedin_oauth_state");
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "unknown_error");
  }
}
