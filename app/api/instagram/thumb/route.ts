import { NextResponse, type NextRequest } from "next/server";
import { getMediaThumbnail } from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";

/** On-demand fresh media thumbnail — keeps page renders off the Graph hot path. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get("accountId");
  const mediaId = request.nextUrl.searchParams.get("mediaId");
  if (!accountId || !mediaId) {
    return NextResponse.json(
      { error: "Missing accountId or mediaId" },
      { status: 400 },
    );
  }

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("access_token")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const url = await getMediaThumbnail(mediaId, account.access_token);
  if (!url) {
    return NextResponse.json({ error: "Thumbnail unavailable" }, { status: 404 });
  }

  // Optionally persist so the next load has a fresher URL.
  void supabase
    .from("automations")
    .update({ media_thumbnail: url })
    .eq("account_id", accountId)
    .eq("ig_media_id", mediaId)
    .eq("user_id", user.id);

  return NextResponse.json(
    { url },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    },
  );
}
