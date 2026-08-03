import { NextResponse } from "next/server";
import { getApiUserWithScopes } from "@/lib/auth";
import { getLoginQrcode } from "@/lib/cross-post/mcp/xhs";

function canAccessMcp(ctx: NonNullable<Awaited<ReturnType<typeof getApiUserWithScopes>>>) {
  return ctx.admin || ctx.scopes.access_platform_sync_post;
}

/** GET /api/mcp/rednote/qr — fetch RedNote login QR code. */
export async function GET() {
  const ctx = await getApiUserWithScopes();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessMcp(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await getLoginQrcode();
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to get QR" }, { status: 502 });
  }

  return NextResponse.json(result.data ?? {});
}
