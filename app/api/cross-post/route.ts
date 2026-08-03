import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import { getApiUserWithScopes } from "@/lib/auth";
import { validateCrossPost } from "@/lib/cross-post/validate";
import { processCrossPost } from "@/lib/cross-post/runner";
import type {
  CrossPostInput,
  CrossPostMediaItem,
  CrossPostMediaType,
  CrossPostPlatform,
} from "@/lib/cross-post/types";
import { isImageMime, isVideoMime } from "@/lib/cross-post/types";

interface PlatformTarget {
  platform: CrossPostPlatform;
  accountRef: string;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parsePlatforms(raw: string | FormDataEntryValue | null): PlatformTarget[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as PlatformTarget[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p.platform && p.accountRef);
  } catch {
    return [];
  }
}

function inferMediaType(files: File[]): CrossPostMediaType {
  const hasVideo = files.some((f) => isVideoMime(f.type));
  if (hasVideo) return "video";
  if (files.length > 1) return "carousel";
  return "image";
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "file";
}

async function parseMultipart(request: Request) {
  const form = await request.formData();
  const caption = String(form.get("caption") ?? "");
  const title = form.get("title") ? String(form.get("title")) : null;
  const tags = parseTags(String(form.get("tags") ?? ""));
  const platforms = parsePlatforms(form.get("platforms"));
  const skipInvalidOnly = form.get("skipInvalidOnly") === "true";
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  return { caption, title, tags, platforms, skipInvalidOnly, files };
}

async function parseJson(request: Request) {
  const body = (await request.json()) as {
    caption?: string;
    title?: string | null;
    tags?: string[] | string;
    platforms?: PlatformTarget[];
    media_type?: CrossPostMediaType;
    media?: CrossPostMediaItem[];
    skipInvalidOnly?: boolean;
  };
  const tags = Array.isArray(body.tags)
    ? body.tags
    : parseTags(typeof body.tags === "string" ? body.tags : "");
  return {
    caption: body.caption ?? "",
    title: body.title ?? null,
    tags,
    platforms: body.platforms ?? [],
    skipInvalidOnly: !!body.skipInvalidOnly,
    mediaType: body.media_type ?? "image",
    media: body.media ?? [],
  };
}

/** POST /api/cross-post — create a cross-post and start publishing. */
export async function POST(request: Request) {
  const ctx = await getApiUserWithScopes();
  if (!ctx) return unauthorized();
  if (!ctx.scopes.access_platform_sync_post && !ctx.admin) return forbidden();

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  let caption: string;
  let title: string | null;
  let tags: string[];
  let platforms: PlatformTarget[];
  let skipInvalidOnly: boolean;
  let files: File[] = [];
  let jsonMedia: CrossPostMediaItem[] = [];
  let mediaType: CrossPostMediaType = "image";

  if (isMultipart) {
    const parsed = await parseMultipart(request);
    caption = parsed.caption;
    title = parsed.title;
    tags = parsed.tags;
    platforms = parsed.platforms;
    skipInvalidOnly = parsed.skipInvalidOnly;
    files = parsed.files;
    mediaType = inferMediaType(files);
  } else {
    const parsed = await parseJson(request);
    caption = parsed.caption;
    title = parsed.title;
    tags = parsed.tags;
    platforms = parsed.platforms;
    skipInvalidOnly = parsed.skipInvalidOnly;
    jsonMedia = parsed.media;
    mediaType = parsed.mediaType;
  }

  if (platforms.length === 0) {
    return NextResponse.json({ error: "Select at least one platform" }, { status: 400 });
  }

  const { supabase, user } = ctx;

  const { data: post, error: postError } = await supabase
    .from("cross_posts")
    .insert({
      user_id: user.id,
      caption,
      title,
      tags,
      media_type: mediaType,
      status: "processing",
    })
    .select("id")
    .single();

  if (postError || !post) {
    return NextResponse.json(
      { error: postError?.message ?? "Failed to create post" },
      { status: 500 },
    );
  }

  const postId = post.id;
  const mediaItems: CrossPostMediaItem[] = [];

  if (isMultipart && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = `${randomUUID()}-${sanitizeFilename(file.name)}`;
      const storagePath = `${user.id}/${postId}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from("cross_post_media")
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) {
        await supabase.from("cross_posts").delete().eq("id", postId);
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from("cross_post_media")
        .getPublicUrl(storagePath);

      mediaItems.push({
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        mime: file.type || null,
        sort_order: i,
      });
    }

    const { error: mediaError } = await supabase.from("cross_post_media").insert(
      mediaItems.map((m, i) => ({
        cross_post_id: postId,
        storage_path: m.storage_path!,
        public_url: m.public_url,
        mime: m.mime,
        sort_order: i,
      })),
    );

    if (mediaError) {
      await supabase.from("cross_posts").delete().eq("id", postId);
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }
  } else if (jsonMedia.length > 0) {
    const rows = jsonMedia.map((m, i) => ({
      cross_post_id: postId,
      storage_path: m.storage_path ?? m.public_url,
      public_url: m.public_url,
      mime: m.mime ?? null,
      width: m.width ?? null,
      height: m.height ?? null,
      duration_sec: m.duration_sec ?? null,
      sort_order: m.sort_order ?? i,
    }));

    const { error: mediaError } = await supabase.from("cross_post_media").insert(rows);
    if (mediaError) {
      await supabase.from("cross_posts").delete().eq("id", postId);
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }

    mediaItems.push(...jsonMedia);
  }

  const input: CrossPostInput = {
    caption,
    title,
    tags,
    media_type: mediaType,
    media: mediaItems,
  };

  const platformNames = platforms.map((p) => p.platform);
  const validation = validateCrossPost(input, platformNames);

  const targetRows: Array<{
    cross_post_id: string;
    platform: string;
    account_ref: string;
    status: string;
    progress: number;
    error: string | null;
  }> = [];

  for (const target of platforms) {
    const platformResult = validation.platforms.find(
      (p) => p.platform === target.platform,
    );
    const hasErrors = platformResult && !platformResult.ok;

    if (hasErrors) {
      if (skipInvalidOnly) continue;
      targetRows.push({
        cross_post_id: postId,
        platform: target.platform,
        account_ref: target.accountRef,
        status: "skipped",
        progress: 0,
        error: platformResult!.errors.join("; "),
      });
    } else {
      targetRows.push({
        cross_post_id: postId,
        platform: target.platform,
        account_ref: target.accountRef,
        status: "queued",
        progress: 0,
        error: null,
      });
    }
  }

  if (targetRows.length === 0) {
    await supabase.from("cross_posts").delete().eq("id", postId);
    return NextResponse.json(
      {
        error: "All selected platforms failed validation",
        validation,
      },
      { status: 400 },
    );
  }

  const { data: targets, error: targetError } = await supabase
    .from("cross_post_targets")
    .insert(targetRows)
    .select("id, platform, account_ref, status, progress, error");

  if (targetError) {
    await supabase.from("cross_posts").delete().eq("id", postId);
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  after(async () => {
    try {
      await processCrossPost(postId);
    } catch (e) {
      console.error("processCrossPost failed:", e);
    }
  });

  return NextResponse.json({ id: postId, targets: targets ?? [] });
}

/** GET /api/cross-post — list recent cross-posts for the user. */
export async function GET() {
  const ctx = await getApiUserWithScopes();
  if (!ctx) return unauthorized();
  if (!ctx.scopes.access_platform_sync_post && !ctx.admin) return forbidden();

  const { supabase } = ctx;

  const { data: posts, error } = await supabase
    .from("cross_posts")
    .select(
      `
      id,
      caption,
      title,
      media_type,
      status,
      created_at,
      cross_post_targets (
        id,
        platform,
        status,
        progress,
        error,
        permalink
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: posts ?? [] });
}
