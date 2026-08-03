import { NextResponse } from "next/server";
import { getApiUserWithScopes } from "@/lib/auth";
import { getDeviceStatus } from "@/lib/cross-post/mcp/wechat";
import { createAdminClient } from "@/lib/supabase/admin";

function canAccessMcp(ctx: NonNullable<Awaited<ReturnType<typeof getApiUserWithScopes>>>) {
  return ctx.admin || ctx.scopes.access_platform_sync_post;
}

/** GET /api/mcp/wechat/status — WeChat MCP device status. */
export async function GET() {
  const ctx = await getApiUserWithScopes();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessMcp(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await getDeviceStatus();
  const ready = !!result.data?.connected;
  const status = ready ? "ready" : result.ok ? "disconnected" : "error";

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mcp_connections")
    .upsert(
      {
        platform: "wechat",
        status,
        last_checked_at: new Date().toISOString(),
        meta: {
          connected: ready,
          device_name: result.data?.device_name ?? null,
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
    ready,
    status,
    connection: row,
    data: result.data,
    error: result.error,
  });
}
