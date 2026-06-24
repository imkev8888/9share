"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { data: existing, error: lookupError } = await supabase
    .from("automations")
    .select("id")
    .eq("account_id", accountId)
    .eq("ig_media_id", media.igMediaId)
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
