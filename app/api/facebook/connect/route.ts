import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getFacebookAuthorizationUrl } from "@/lib/facebook";
import { createClient } from "@/lib/supabase/server";

/**
 * Kicks off the Facebook OAuth flow.
 * GET /api/facebook/connect  ->  redirects to Facebook's consent screen.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL!),
    );
  }

  // CSRF state — verified in the callback.
  const state = randomBytes(16).toString("hex");
  const authUrl = getFacebookAuthorizationUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
