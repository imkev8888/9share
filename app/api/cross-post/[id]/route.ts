import { NextResponse } from "next/server";
import { getApiUserWithScopes } from "@/lib/auth";

/** GET /api/cross-post/[id] — post detail with media and targets. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiUserWithScopes();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ctx.scopes.access_platform_sync_post && !ctx.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { supabase } = ctx;

  const { data: post, error } = await supabase
    .from("cross_posts")
    .select(
      `
      id,
      caption,
      title,
      tags,
      media_type,
      status,
      created_at,
      updated_at,
      cross_post_media (
        id,
        storage_path,
        public_url,
        mime,
        width,
        height,
        duration_sec,
        sort_order
      ),
      cross_post_targets (
        id,
        platform,
        account_ref,
        status,
        progress,
        error,
        external_post_id,
        permalink,
        created_at,
        updated_at
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(post);
}
