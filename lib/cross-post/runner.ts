/**
 * Cross-post runner — loads a post and publishes to all targets in parallel.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CrossPostInput,
  CrossPostMediaItem,
  CrossPostPlatform,
  PublishContext,
  PublishResult,
  TargetStatus,
} from "./types";
import { validateForPlatform } from "./validate";
import { publishToFacebook } from "./publish/facebook";
import { publishToInstagram } from "./publish/instagram";
import { publishToThreads } from "./publish/threads";
import { publishToLinkedIn } from "./publish/linkedin";
import { publishToRedNote } from "./publish/rednote";
import { publishToWeChat } from "./publish/wechat";

interface CrossPostRow {
  id: string;
  user_id: string;
  caption: string | null;
  title: string | null;
  tags: string[] | null;
  media_type: string;
  status: string;
}

interface TargetRow {
  id: string;
  cross_post_id: string;
  platform: string;
  account_ref: string;
  status: string;
  progress: number;
}

interface MediaRow {
  id: string;
  storage_path: string | null;
  public_url: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  sort_order: number;
}

async function updateTarget(
  targetId: string,
  patch: {
    status?: TargetStatus;
    progress?: number;
    error?: string | null;
    external_post_id?: string | null;
    permalink?: string | null;
  },
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("cross_post_targets")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", targetId);
}

async function resolveCredentials(
  platform: CrossPostPlatform,
  accountRef: string,
  userId: string,
): Promise<
  | { ok: true; creds: Record<string, string> }
  | { ok: false; error: string }
> {
  const admin = createAdminClient();

  switch (platform) {
    case "instagram": {
      const { data, error } = await admin
        .from("instagram_accounts")
        .select("id, ig_user_id, access_token")
        .eq("id", accountRef)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) {
        return { ok: false, error: "Instagram account not found" };
      }
      return {
        ok: true,
        creds: {
          igUserId: data.ig_user_id,
          accessToken: data.access_token,
        },
      };
    }
    case "facebook": {
      const { data, error } = await admin
        .from("facebook_pages")
        .select("id, page_id, page_access_token")
        .eq("id", accountRef)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) {
        return { ok: false, error: "Facebook Page not found" };
      }
      return {
        ok: true,
        creds: {
          pageId: data.page_id,
          pageAccessToken: data.page_access_token,
        },
      };
    }
    case "threads": {
      const { data, error } = await admin
        .from("threads_accounts")
        .select("id, threads_user_id, access_token")
        .eq("id", accountRef)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) {
        return { ok: false, error: "Threads account not found" };
      }
      return {
        ok: true,
        creds: {
          threadsUserId: data.threads_user_id,
          accessToken: data.access_token,
        },
      };
    }
    case "linkedin": {
      const { data, error } = await admin
        .from("linkedin_accounts")
        .select("id, linkedin_member_urn, access_token")
        .eq("id", accountRef)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) {
        return { ok: false, error: "LinkedIn account not found" };
      }
      return {
        ok: true,
        creds: {
          memberUrn: data.linkedin_member_urn,
          accessToken: data.access_token,
        },
      };
    }
    case "rednote":
    case "wechat": {
      const { data, error } = await admin
        .from("mcp_connections")
        .select("id, platform, status")
        .eq("id", accountRef)
        .eq("platform", platform)
        .maybeSingle();
      if (error || !data) {
        return { ok: false, error: `${platform} MCP connection not found` };
      }
      if (data.status !== "connected" && data.status !== "ready") {
        return {
          ok: false,
          error: `${platform} MCP is not connected (status: ${data.status})`,
        };
      }
      return { ok: true, creds: {} };
    }
    default:
      return { ok: false, error: `Unknown platform: ${platform}` };
  }
}

async function runTarget(
  post: CrossPostRow,
  target: TargetRow,
  input: CrossPostInput,
): Promise<PublishResult> {
  const platform = target.platform as CrossPostPlatform;
  const ctx: PublishContext = {
    postId: post.id,
    targetId: target.id,
    userId: post.user_id,
    accountRef: target.account_ref,
    input,
    onProgress: async (progress) => {
      await updateTarget(target.id, { progress });
    },
  };

  await updateTarget(target.id, { status: "validating", progress: 0 });

  const validation = validateForPlatform(platform, input);
  if (!validation.ok) {
    const err = validation.errors.join("; ");
    await updateTarget(target.id, {
      status: "failed",
      progress: 0,
      error: err,
    });
    return { ok: false, error: err };
  }

  await updateTarget(target.id, { status: "uploading", progress: 5 });

  const credsResult = await resolveCredentials(
    platform,
    target.account_ref,
    post.user_id,
  );
  if (!credsResult.ok) {
    await updateTarget(target.id, {
      status: "failed",
      error: credsResult.error,
    });
    return { ok: false, error: credsResult.error };
  }

  await updateTarget(target.id, { status: "publishing", progress: 10 });

  let result: PublishResult;

  switch (platform) {
    case "facebook":
      result = await publishToFacebook(ctx, {
        pageId: credsResult.creds.pageId,
        pageAccessToken: credsResult.creds.pageAccessToken,
      });
      break;
    case "instagram":
      result = await publishToInstagram(ctx, {
        igUserId: credsResult.creds.igUserId,
        accessToken: credsResult.creds.accessToken,
      });
      break;
    case "threads":
      result = await publishToThreads(ctx, {
        threadsUserId: credsResult.creds.threadsUserId,
        accessToken: credsResult.creds.accessToken,
      });
      break;
    case "linkedin":
      result = await publishToLinkedIn(ctx, {
        memberUrn: credsResult.creds.memberUrn,
        accessToken: credsResult.creds.accessToken,
      });
      break;
    case "rednote":
      result = await publishToRedNote(ctx);
      break;
    case "wechat":
      result = await publishToWeChat(ctx);
      break;
    default:
      result = { ok: false, error: `Unsupported platform: ${platform}` };
  }

  if (result.skipped) {
    await updateTarget(target.id, {
      status: "skipped",
      progress: 100,
      error: result.error ?? null,
    });
    return result;
  }

  if (result.ok) {
    await updateTarget(target.id, {
      status: "success",
      progress: 100,
      error: null,
      external_post_id: result.external_post_id ?? null,
      permalink: result.permalink ?? null,
    });
  } else {
    await updateTarget(target.id, {
      status: "failed",
      error: result.error ?? "Publish failed",
    });
  }

  return result;
}

function toInput(post: CrossPostRow, media: MediaRow[]): CrossPostInput {
  const items: CrossPostMediaItem[] = media
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      id: m.id,
      storage_path: m.storage_path,
      public_url: m.public_url,
      mime: m.mime,
      width: m.width,
      height: m.height,
      duration_sec: m.duration_sec ? Number(m.duration_sec) : null,
      sort_order: m.sort_order,
    }));

  return {
    caption: post.caption,
    title: post.title,
    tags: post.tags,
    media_type: post.media_type as CrossPostInput["media_type"],
    media: items,
  };
}

export interface ProcessCrossPostResult {
  postId: string;
  status: "completed" | "partial" | "failed";
  results: Array<{ targetId: string; platform: string; result: PublishResult }>;
}

/** Load a cross-post and publish to all queued targets. */
export async function processCrossPost(
  postId: string,
): Promise<ProcessCrossPostResult> {
  const admin = createAdminClient();

  const { data: post, error: postErr } = await admin
    .from("cross_posts")
    .select("id, user_id, caption, title, tags, media_type, status")
    .eq("id", postId)
    .single();

  if (postErr || !post) {
    throw new Error(postErr?.message || "Cross-post not found");
  }

  await admin
    .from("cross_posts")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", postId);

  const { data: media } = await admin
    .from("cross_post_media")
    .select(
      "id, storage_path, public_url, mime, width, height, duration_sec, sort_order",
    )
    .eq("cross_post_id", postId)
    .order("sort_order");

  const { data: targets } = await admin
    .from("cross_post_targets")
    .select("id, cross_post_id, platform, account_ref, status, progress")
    .eq("cross_post_id", postId);

  const input = toInput(post as CrossPostRow, (media ?? []) as MediaRow[]);
  const activeTargets = (targets ?? []).filter(
    (t) => t.status === "queued" || t.status === "validating",
  ) as TargetRow[];

  const outcomes = await Promise.all(
    activeTargets.map(async (target) => {
      const result = await runTarget(post as CrossPostRow, target, input);
      return { targetId: target.id, platform: target.platform, result };
    }),
  );

  const successCount = outcomes.filter((o) => o.result.ok).length;
  const skippedCount = outcomes.filter((o) => o.result.skipped).length;
  const failCount = outcomes.length - successCount - skippedCount;

  let finalStatus: "completed" | "partial" | "failed";
  if (successCount === outcomes.length) {
    finalStatus = "completed";
  } else if (successCount > 0) {
    finalStatus = "partial";
  } else if (skippedCount === outcomes.length) {
    finalStatus = "failed";
  } else {
    finalStatus = failCount === outcomes.length ? "failed" : "partial";
  }

  await admin
    .from("cross_posts")
    .update({ status: finalStatus, updated_at: new Date().toISOString() })
    .eq("id", postId);

  return { postId, status: finalStatus, results: outcomes };
}
