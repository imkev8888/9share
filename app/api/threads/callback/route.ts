import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeThreadsCodeForToken,
  getThreadsLongLivedToken,
  getThreadsProfile,
} from "@/lib/threads";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** OAuth redirect target for Threads. */
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

  const cookieState = request.cookies.get("threads_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return fail("invalid_state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl));

  try {
    const short = await exchangeThreadsCodeForToken(code);
    const long = await getThreadsLongLivedToken(short.access_token);
    const profile = await getThreadsProfile(long.access_token);

    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000).toISOString()
      : null;

    const admin = createAdminClient();
    const { error: upsertError } = await admin.from("threads_accounts").upsert(
      {
        user_id: user.id,
        threads_user_id: profile.id,
        username: profile.username ?? null,
        name: profile.name ?? null,
        access_token: long.access_token,
        token_expires_at: expiresAt,
      },
      { onConflict: "threads_user_id" },
    );

    if (upsertError) return fail(upsertError.message);

    const res = NextResponse.redirect(
      new URL("/dashboard/channels?connect=threads_success", appUrl),
    );
    res.cookies.delete("threads_oauth_state");
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "unknown_error");
  }
}
