"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function disconnectInstagram(accountId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("instagram_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/channels");
}

export async function disconnectFacebookPage(pageId: string) {
  const { supabase, user } = await requireUser();

  const { data: page } = await supabase
    .from("facebook_pages")
    .select("page_id, page_access_token")
    .eq("id", pageId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (page) {
    // Best effort — stop webhook deliveries for this Page.
    const { unsubscribePageFromWebhooks } = await import("@/lib/facebook");
    await unsubscribePageFromWebhooks(
      page.page_id,
      page.page_access_token,
    ).catch(() => {});
  }

  await supabase
    .from("facebook_pages")
    .delete()
    .eq("id", pageId)
    .eq("user_id", user.id);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/channels");
}

export async function disconnectThreads(accountId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("threads_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/channels");
  revalidatePath("/dashboard/cross-post");
}

export async function disconnectLinkedIn(accountId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("linkedin_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/channels");
  revalidatePath("/dashboard/cross-post");
}

export interface AutomationMediaInput {
  igMediaId: string;
  mediaPermalink?: string;
  mediaThumbnail?: string;
  mediaCaption?: string;
}

export interface AutomationInput extends AutomationMediaInput {
  accountId: string;
  name: string;
  keyword?: string;
  dmMessage: string;
  publicReply?: string;
}

interface SharedCampaign {
  name: string;
  keyword?: string;
  dmMessage: string;
  publicReply?: string;
}

/** Create/update one automation for a single post. Kept for backward compat. */
export async function createAutomation(input: AutomationInput) {
  return createAutomations({
    accountId: input.accountId,
    media: [
      {
        igMediaId: input.igMediaId,
        mediaPermalink: input.mediaPermalink,
        mediaThumbnail: input.mediaThumbnail,
        mediaCaption: input.mediaCaption,
      },
    ],
    name: input.name,
    keyword: input.keyword,
    dmMessage: input.dmMessage,
    publicReply: input.publicReply,
  });
}

export interface CreateAutomationsInput {
  accountId: string;
  media: AutomationMediaInput[];
  name: string;
  keyword?: string;
  dmMessage: string;
  publicReply?: string;
}

/**
 * Create/update an automation for each selected post/reel, applying the same
 * campaign settings (keyword, DM, public reply) to all of them.
 */
export async function createAutomations(input: CreateAutomationsInput) {
  const { supabase, user } = await requireUser();

  if (!input.dmMessage?.trim()) {
    return { error: "DM message is required." };
  }
  if (!input.media?.length) {
    return { error: "Pick at least one post or reel." };
  }

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("id")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return { error: "Instagram account not found. Try reconnecting it." };
  }

  const shared: SharedCampaign = {
    name: input.name,
    keyword: input.keyword,
    dmMessage: input.dmMessage,
    publicReply: input.publicReply,
  };

  let created = 0;
  let firstError: string | null = null;

  for (const media of input.media) {
    if (!media.igMediaId) continue;
    const res = await saveAutomation(
      supabase,
      user.id,
      input.accountId,
      media,
      shared,
    );
    if (res.error) {
      firstError = firstError ?? res.error;
    } else {
      created += 1;
    }
  }

  revalidatePath("/dashboard/automations");
  revalidatePath("/dashboard");

  if (created === 0) {
    return { error: firstError ?? "Could not save these automations." };
  }
  return { ok: true, created, failed: input.media.length - created };
}

async function saveAutomation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  media: AutomationMediaInput,
  shared: SharedCampaign,
) {
  const payload = {
    user_id: userId,
    account_id: accountId,
    ig_media_id: media.igMediaId,
    media_permalink: nullableText(media.mediaPermalink),
    media_thumbnail: nullableText(media.mediaThumbnail),
    media_caption: nullableText(media.mediaCaption),
    name: cleanText(shared.name) || captionToName(media.mediaCaption),
    keyword: nullableText(shared.keyword),
    dm_message: cleanText(shared.dmMessage),
    public_reply: nullableText(shared.publicReply),
    is_active: true,
  };

  // Prefer update when this post already has a campaign for the account.
  // Lookup by account+media (not only user_id) so a reconnected account
  // doesn't try to insert a duplicate and hit the unique constraint.
  const { data: existing, error: lookupError } = await supabase
    .from("automations")
    .select("id")
    .eq("account_id", accountId)
    .eq("ig_media_id", media.igMediaId)
    .maybeSingle();

  if (lookupError) return { error: formatDatabaseError(lookupError) };

  if (existing) {
    const { error } = await supabase
      .from("automations")
      .update(payload)
      .eq("id", existing.id)
      .eq("account_id", accountId);
    if (error) return { error: formatDatabaseError(error) };
    return { ok: true };
  }

  const { error } = await supabase.from("automations").insert(payload);
  if (!error) return { ok: true };

  // Row exists but RLS hid it (account reconnected under a new login).
  // Re-home + update via service role so the user isn't stuck.
  if (error.code === "23505") {
    const admin = createAdminClient();
    const { data: orphan } = await admin
      .from("automations")
      .select("id")
      .eq("account_id", accountId)
      .eq("ig_media_id", media.igMediaId)
      .maybeSingle();
    if (orphan) {
      const { error: fixError } = await admin
        .from("automations")
        .update(payload)
        .eq("id", orphan.id);
      if (fixError) return { error: formatDatabaseError(fixError) };
      await admin
        .from("automation_logs")
        .update({ user_id: userId })
        .eq("account_id", accountId);
      return { ok: true };
    }
    return {
      error:
        "This post already has an automation. Open Automations to edit it, or reconnect Instagram if the list looks empty.",
    };
  }

  return { error: formatDatabaseError(error) };
}

export interface FacebookPostInput {
  /** Our facebook_pages row id (uuid), not the raw Facebook Page id. */
  pageId: string;
  postId: string;
  permalink?: string;
  thumbnail?: string;
  caption?: string;
}

export interface CreateCampaignInput {
  name: string;
  keyword?: string;
  dmMessage: string;
  publicReply?: string;
  instagram?: { accountId: string; media: AutomationMediaInput[] };
  facebook?: { posts: FacebookPostInput[] };
}

/**
 * Multi-channel campaign: creates one automation per selected Instagram post
 * and/or Facebook Page post, all sharing the same keyword/DM/public reply.
 */
export async function createCampaign(input: CreateCampaignInput) {
  const { supabase, user } = await requireUser();

  if (!input.dmMessage?.trim()) {
    return { error: "DM message is required." };
  }

  const igMedia = input.instagram?.media ?? [];
  const fbPosts = input.facebook?.posts ?? [];
  if (igMedia.length === 0 && fbPosts.length === 0) {
    return { error: "Pick at least one post." };
  }

  const shared: SharedCampaign = {
    name: input.name,
    keyword: input.keyword,
    dmMessage: input.dmMessage,
    publicReply: input.publicReply,
  };

  let created = 0;
  let attempted = 0;
  let firstError: string | null = null;

  if (igMedia.length > 0) {
    const accountId = input.instagram!.accountId;
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account) {
      firstError = "Instagram account not found. Try reconnecting it.";
    } else {
      for (const media of igMedia) {
        if (!media.igMediaId) continue;
        attempted += 1;
        const res = await saveAutomation(
          supabase,
          user.id,
          accountId,
          media,
          shared,
        );
        if (res.error) firstError = firstError ?? res.error;
        else created += 1;
      }
    }
  }

  if (fbPosts.length > 0) {
    // Verify every referenced Page belongs to this user.
    const { data: pages } = await supabase
      .from("facebook_pages")
      .select("id")
      .eq("user_id", user.id);
    const ownedPageIds = new Set((pages ?? []).map((p) => p.id));

    for (const post of fbPosts) {
      if (!post.postId) continue;
      attempted += 1;
      if (!ownedPageIds.has(post.pageId)) {
        firstError =
          firstError ?? "Facebook Page not found. Try reconnecting it.";
        continue;
      }
      const res = await saveFacebookAutomation(
        supabase,
        user.id,
        post,
        shared,
      );
      if (res.error) firstError = firstError ?? res.error;
      else created += 1;
    }
  }

  revalidatePath("/dashboard/automations");
  revalidatePath("/dashboard");

  if (created === 0) {
    return { error: firstError ?? "Could not save these automations." };
  }
  return { ok: true, created, failed: attempted - created };
}

async function saveFacebookAutomation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  post: FacebookPostInput,
  shared: SharedCampaign,
) {
  // ig_media_id doubles as the post id column for Facebook rows.
  const payload = {
    user_id: userId,
    platform: "facebook",
    account_id: null,
    fb_page_id: post.pageId,
    ig_media_id: post.postId,
    media_permalink: nullableText(post.permalink),
    media_thumbnail: nullableText(post.thumbnail),
    media_caption: nullableText(post.caption),
    name: cleanText(shared.name) || captionToName(post.caption),
    keyword: nullableText(shared.keyword),
    dm_message: cleanText(shared.dmMessage),
    public_reply: nullableText(shared.publicReply),
    is_active: true,
  };

  const { data: existing, error: lookupError } = await supabase
    .from("automations")
    .select("id")
    .eq("fb_page_id", post.pageId)
    .eq("ig_media_id", post.postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) return { error: formatDatabaseError(lookupError) };

  const { error } = existing
    ? await supabase
        .from("automations")
        .update(payload)
        .eq("id", existing.id)
        .eq("user_id", userId)
    : await supabase.from("automations").insert(payload);

  if (error) return { error: formatDatabaseError(error) };
  return { ok: true };
}

export interface UpdateAutomationInput {
  id: string;
  name: string;
  keyword?: string;
  dmMessage: string;
  publicReply?: string;
}

/**
 * Edit an automation's campaign content (name, keyword, DM, public reply).
 * Allowed at any time — including while the automation is active.
 */
export async function updateAutomation(input: UpdateAutomationInput) {
  const { supabase, user } = await requireUser();

  if (!input.dmMessage?.trim()) {
    return { error: "DM message is required." };
  }

  const { error } = await supabase
    .from("automations")
    .update({
      name: cleanText(input.name) || "Untitled campaign",
      keyword: nullableText(input.keyword),
      dm_message: cleanText(input.dmMessage),
      public_reply: nullableText(input.publicReply),
    })
    .eq("id", input.id)
    .eq("user_id", user.id);

  if (error) return { error: formatDatabaseError(error) };

  revalidatePath("/dashboard/automations");
  revalidatePath("/dashboard/tracking");
  return { ok: true };
}

export async function toggleAutomation(id: string, isActive: boolean) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("automations")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/dashboard/automations");
}

export async function deleteAutomation(id: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("automations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/dashboard/automations");
  revalidatePath("/dashboard");
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function captionToName(caption: string | null | undefined) {
  const text = (caption ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Untitled campaign";
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function nullableText(value: string | null | undefined) {
  const text = cleanText(value);
  return text.length > 0 ? text : null;
}

function formatDatabaseError(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}) {
  const parts = [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .map(String);

  if (parts.length === 0 || error.message === "Empty or invalid json") {
    return "Could not save this automation. Please try again, or reconnect Instagram if it keeps happening.";
  }

  return parts.join(" ");
}
