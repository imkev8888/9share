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

  const { error } = await supabase.from("automations").upsert(
    {
      user_id: user.id,
      account_id: input.accountId,
      ig_media_id: input.igMediaId,
      media_permalink: input.mediaPermalink ?? null,
      media_thumbnail: input.mediaThumbnail ?? null,
      media_caption: input.mediaCaption ?? null,
      name: input.name?.trim() || "Untitled campaign",
      keyword: input.keyword?.trim() || null,
      dm_message: input.dmMessage.trim(),
      public_reply: input.publicReply?.trim() || null,
      is_active: true,
    },
    { onConflict: "account_id,ig_media_id" },
  );

  if (error) return { error: error.message };

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
