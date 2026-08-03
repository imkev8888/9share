import { NextResponse } from "next/server";
import { getApiUserWithScopes } from "@/lib/auth";
import { validateCrossPost } from "@/lib/cross-post/validate";
import type {
  CrossPostInput,
  CrossPostPlatform,
} from "@/lib/cross-post/types";

/** POST /api/cross-post/validate — validate input for selected platforms. */
export async function POST(request: Request) {
  const ctx = await getApiUserWithScopes();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ctx.scopes.access_platform_sync_post && !ctx.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as CrossPostInput & {
    platforms?: CrossPostPlatform[];
  };

  const platforms = body.platforms ?? [];
  if (platforms.length === 0) {
    return NextResponse.json(
      { error: "Select at least one platform" },
      { status: 400 },
    );
  }

  const input: CrossPostInput = {
    caption: body.caption ?? "",
    title: body.title ?? null,
    tags: body.tags ?? [],
    media_type: body.media_type ?? "image",
    media: body.media ?? [],
  };

  const validation = validateCrossPost(input, platforms);
  return NextResponse.json(validation);
}
