import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeFacebookCodeForToken,
  getLongLivedUserToken,
} from "@/lib/facebook";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth redirect target. Facebook sends ?code & ?state here.
 * We exchange the code for a long-lived USER token, stash it in a short-lived
 * cookie, and send the user to the "Choose your Pages" picker — one Facebook
 * account often manages several Pages, so we never auto-connect all of them.
 */
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

  // Verify CSRF state.
  const cookieState = request.cookies.get("fb_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return fail("invalid_state");

  // Must be logged into 9share.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl));

  try {
    const short = await exchangeFacebookCodeForToken(code);
    const long = await getLongLivedUserToken(short.access_token);

    const res = NextResponse.redirect(
      new URL("/dashboard/channels/facebook", appUrl),
    );
    // Short-lived, httpOnly: only used by the Page picker + confirm endpoint.
    res.cookies.set("fb_user_token", long.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    res.cookies.delete("fb_oauth_state");
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "unknown_error");
  }
}
