import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getProfile,
  subscribeToWebhooks,
} from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adoptOrphanedAutomations } from "@/lib/adopt-automations";

/**
 * OAuth redirect target. Instagram sends ?code & ?state here.
 * We exchange the code, store the long-lived token, and subscribe to webhooks.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/dashboard?connect=error&reason=${encodeURIComponent(reason)}`, appUrl),
    );

  if (error) return fail(url.searchParams.get("error_description") || error);
  if (!code) return fail("missing_code");

  // Verify CSRF state.
  const cookieState = request.cookies.get("ig_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return fail("invalid_state");

  // Must be logged into 9share.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl));

  try {
    const short = await exchangeCodeForToken(code);
    const long = await getLongLivedToken(short.access_token);
    const profile = await getProfile(long.access_token);

    // Start receiving comment webhooks for this account.
    await subscribeToWebhooks(long.access_token);

    const expiresAt = new Date(
      Date.now() + long.expires_in * 1000,
    ).toISOString();

    // Service role: token storage shouldn't depend on the RLS session here.
    const admin = createAdminClient();
    const { data: accountRow, error: upsertError } = await admin
      .from("instagram_accounts")
      .upsert(
        {
          user_id: user.id,
          ig_user_id: profile.user_id,
          username: profile.username,
          name: profile.name ?? null,
          profile_picture_url: profile.profile_picture_url ?? null,
          access_token: long.access_token,
          token_expires_at: expiresAt,
        },
        { onConflict: "ig_user_id" },
      )
      .select("id")
      .single();

    if (upsertError) return fail(upsertError.message);

    // Reconnecting can move the IG account row to a new 9share user while
    // old automations stay on the previous user_id. RLS then hides them
    // (empty Automations page) but the unique (account_id, ig_media_id)
    // constraint still blocks creating a new one. Re-home them.
    if (accountRow?.id) {
      await admin
        .from("automations")
        .update({ user_id: user.id })
        .eq("account_id", accountRow.id);
      await admin
        .from("automation_logs")
        .update({ user_id: user.id })
        .eq("account_id", accountRow.id);

      // A previous disconnect left this account's automations without a
      // channel. Claim them back now that it exists again.
      await adoptOrphanedAutomations({
        admin,
        column: "account_id",
        channelId: accountRow.id,
        channelRef: profile.user_id,
        userId: user.id,
      });
    }

    const res = NextResponse.redirect(
      new URL("/dashboard?connect=success", appUrl),
    );
    res.cookies.delete("ig_oauth_state");
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "unknown_error");
  }
}
