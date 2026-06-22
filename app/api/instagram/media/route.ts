import { NextResponse, type NextRequest } from "next/server";
import { getMediaPage } from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get("accountId");
  const after = request.nextUrl.searchParams.get("after");

  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
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

  try {
    const page = await getMediaPage(account.access_token, 30, after);
    return NextResponse.json(page);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load posts";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
