import { NextResponse, type NextRequest } from "next/server";
import { getApiUserWithScopes } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One page of a campaign's interactions. Matches the Tracking sheet's first page. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const STATUSES = new Set(["sent", "skipped", "failed"]);

/**
 * GET /api/automations/[id]/logs
 *
 * Paging, filtering and searching one campaign's rows. All three live here
 * rather than in the browser because the page only ever holds 20 rows: asking
 * it to filter locally would report no failures on a campaign that has fifty.
 *
 * Keyset paging on created_at, not offset, so comments arriving mid-scroll
 * cannot shift rows onto a page the reader already passed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiUserWithScopes();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ctx.scopes.access_automation && !ctx.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = request.nextUrl;

  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const status = searchParams.get("status");
  const before = searchParams.get("before");
  const q = (searchParams.get("q") ?? "").trim();

  // Ask for one extra row: its presence is what tells us there is another page,
  // without a second counting query.
  let query = ctx.supabase
    .from("automation_logs")
    .select(
      "id, comment_id, commenter_username, comment_text, status, error, source, created_at",
    )
    .eq("user_id", ctx.user.id)
    .neq("source", "manual")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  // "deleted" is the bucket for rows whose campaign is gone, which the sheet
  // renders as its own group.
  query = id === "deleted" ? query.is("automation_id", null) : query.eq("automation_id", id);

  if (status && STATUSES.has(status)) query = query.eq("status", status);
  if (before) query = query.lt("created_at", before);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(
      `commenter_username.ilike.%${safe}%,comment_text.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;

  return NextResponse.json({
    interactions: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
  });
}
