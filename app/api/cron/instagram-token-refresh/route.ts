import { NextResponse, type NextRequest } from "next/server";
import { refreshLongLivedToken } from "@/lib/instagram";
import { createAdminClient } from "@/lib/supabase/admin";

const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const refreshBefore = new Date(now.getTime() + REFRESH_WINDOW_MS);
  const admin = createAdminClient();
  const { data: accounts, error: selectError } = await admin
    .from("instagram_accounts")
    .select("id, access_token")
    .gt("token_expires_at", now.toISOString())
    .lte("token_expires_at", refreshBefore.toISOString());

  if (selectError) {
    console.error("Failed to load Instagram tokens for refresh", selectError);
    return NextResponse.json(
      { error: "Failed to load Instagram accounts" },
      { status: 500 },
    );
  }

  let refreshed = 0;
  let failed = 0;

  for (const account of accounts ?? []) {
    try {
      const token = await refreshLongLivedToken(account.access_token);
      const tokenExpiresAt = new Date(
        Date.now() + token.expires_in * 1000,
      ).toISOString();
      const { error: updateError } = await admin
        .from("instagram_accounts")
        .update({
          access_token: token.access_token,
          token_expires_at: tokenExpiresAt,
        })
        .eq("id", account.id);

      if (updateError) throw updateError;
      refreshed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to refresh Instagram account ${account.id}`, error);
    }
  }

  return NextResponse.json({
    checked: accounts?.length ?? 0,
    refreshed,
    failed,
  });
}
