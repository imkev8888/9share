import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getApiUserWithScopes } from "@/lib/auth";
import {
  BUCKET,
  MAX_ATTACHMENTS,
  attachmentKind,
  rejectFile,
  type DmAttachment,
} from "@/lib/dm-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return base || "file";
}

/**
 * POST /api/automations/media
 *
 * Uploads the pictures or video a campaign will send once its button is
 * tapped. Every file is checked against Meta's own format and size limits
 * here, not just in the browser, because a file Instagram refuses at send time
 * fails long after the person is expecting it.
 */
export async function POST(request: NextRequest) {
  const ctx = await getApiUserWithScopes();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ctx.scopes.access_automation && !ctx.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a file upload" },
      { status: 400 },
    );
  }

  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files received" }, { status: 400 });
  }
  if (files.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `Instagram accepts at most ${MAX_ATTACHMENTS} attachments.` },
      { status: 400 },
    );
  }

  for (const file of files) {
    const reason = rejectFile(file);
    if (reason) return NextResponse.json({ error: reason }, { status: 400 });
  }

  // Drafts have no automation id yet; they are still scoped under the user's
  // own folder, which is what the storage policy checks.
  const scope = (form.get("automationId") as string | null)?.trim() || "draft";
  const folder = scope.replace(/[^a-zA-Z0-9-]/g, "") || "draft";

  const uploaded: DmAttachment[] = [];
  for (const file of files) {
    const path = `${ctx.user.id}/${folder}/${randomUUID()}-${sanitizeFilename(file.name)}`;

    const { error } = await ctx.supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
    if (error) {
      // Leave nothing half-uploaded behind for a request that failed.
      if (uploaded.length > 0) {
        await ctx.supabase.storage
          .from(BUCKET)
          .remove(uploaded.map((u) => u.path));
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = ctx.supabase.storage.from(BUCKET).getPublicUrl(path);
    uploaded.push({
      url: data.publicUrl,
      path,
      type: attachmentKind(file.type)!,
      mime: file.type,
    });
  }

  return NextResponse.json({ attachments: uploaded });
}

/** DELETE /api/automations/media?path=… — drop one file the user removed. */
export async function DELETE(request: NextRequest) {
  const ctx = await getApiUserWithScopes();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  // The storage policy enforces this too; failing here gives a clearer answer.
  if (!path.startsWith(`${ctx.user.id}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await ctx.supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
