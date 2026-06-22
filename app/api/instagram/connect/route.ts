import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuthorizationUrl } from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";

/**
 * Kicks off the Instagram OAuth flow.
 * GET /api/instagram/connect  ->  redirects to Instagram's consent screen.
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
  const authUrl = getAuthorizationUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
