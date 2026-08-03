import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getLinkedInAuthorizationUrl } from "@/lib/linkedin";
import { createClient } from "@/lib/supabase/server";

/** GET /api/linkedin/connect — start LinkedIn OAuth. */
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

  const state = randomBytes(16).toString("hex");
  const authUrl = getLinkedInAuthorizationUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("linkedin_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
