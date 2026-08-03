"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateUserScopes(
  userId: string,
  accessAutomation: boolean,
  accessPlatformSyncPost: boolean,
) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("user_profiles").upsert(
    {
      user_id: userId,
      access_automation: accessAutomation,
      access_platform_sync_post: accessPlatformSyncPost,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/admin/users");
}
