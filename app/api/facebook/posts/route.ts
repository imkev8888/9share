import { NextResponse, type NextRequest } from "next/server";
import { getPagePostsPage } from "@/lib/facebook";
import { createClient } from "@/lib/supabase/server";

/** Paginated Facebook Page posts for the campaign-builder picker. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pageId = request.nextUrl.searchParams.get("pageId");
  const after = request.nextUrl.searchParams.get("after");

  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId" }, { status: 400 });
  }

  const { data: page } = await supabase
    .from("facebook_pages")
    .select("page_id, page_access_token")
    .eq("id", pageId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  try {
    const posts = await getPagePostsPage(
      page.page_id,
      page.page_access_token,
      30,
      after,
    );
    return NextResponse.json(posts);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load posts";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
