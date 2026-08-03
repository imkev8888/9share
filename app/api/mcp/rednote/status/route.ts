import { NextResponse } from "next/server";
import { getApiUserWithScopes } from "@/lib/auth";
import { checkLoginStatus } from "@/lib/cross-post/mcp/xhs";
import { createAdminClient } from "@/lib/supabase/admin";

function canAccessMcp(ctx: NonNullable<Awaited<ReturnType<typeof getApiUserWithScopes>>>) {
  return ctx.admin || ctx.scopes.access_platform_sync_post;
}

/** GET /api/mcp/rednote/status — RedNote MCP login status. */
export async function GET() {
  const ctx = await getApiUserWithScopes();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessMcp(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await checkLoginStatus();
  const loggedIn = !!result.data?.logged_in;
  const status = loggedIn ? "connected" : result.ok ? "disconnected" : "error";

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mcp_connections")
    .upsert(
      {
        platform: "rednote",
        status,
        last_checked_at: new Date().toISOString(),
        meta: {
          logged_in: loggedIn,
          username: result.data?.username ?? null,
          raw_status: result.data?.status ?? null,
          error: result.error ?? null,
        },
      },
      { onConflict: "platform" },
    )
    .select("id, platform, status, label, last_checked_at, meta")
    .single();

  return NextResponse.json({
    ok: result.ok,
    logged_in: loggedIn,
    status,
    connection: row,
    data: result.data,
    error: result.error,
  });
}
