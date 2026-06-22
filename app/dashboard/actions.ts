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

export interface AutomationInput {
  accountId: string;
  igMediaId: string;
  mediaPermalink?: string;
  mediaThumbnail?: string;
  mediaCaption?: string;
  name: string;
  keyword?: string;
  dmMessage: string;
  publicReply?: string;
}

export async function createAutomation(input: AutomationInput) {
  const { supabase, user } = await requireUser();

  if (!input.dmMessage?.trim()) {
    return { error: "DM message is required." };
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

  const payload = {
    user_id: user.id,
    account_id: input.accountId,
    ig_media_id: input.igMediaId,
    media_permalink: nullableText(input.mediaPermalink),
    media_thumbnail: nullableText(input.mediaThumbnail),
    media_caption: nullableText(input.mediaCaption),
    name: cleanText(input.name) || "Untitled campaign",
    keyword: nullableText(input.keyword),
    dm_message: cleanText(input.dmMessage),
    public_reply: nullableText(input.publicReply),
    is_active: true,
  };

  const { data: existing, error: lookupError } = await supabase
    .from("automations")
    .select("id")
    .eq("account_id", input.accountId)
    .eq("ig_media_id", input.igMediaId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) return { error: formatDatabaseError(lookupError) };

  const { error } = existing
    ? await supabase
        .from("automations")
        .update(payload)
        .eq("id", existing.id)
        .eq("user_id", user.id)
    : await supabase.from("automations").insert(payload);

  if (error) return { error: formatDatabaseError(error) };

  revalidatePath("/dashboard/automations");
  revalidatePath("/dashboard");
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
