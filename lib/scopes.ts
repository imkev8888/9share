import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductMode = "automation" | "cross_post";

export interface UserScopes {
  access_automation: boolean;
  access_platform_sync_post: boolean;
}

export const PRODUCT_COOKIE = "9share_product";

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "kev@boostteamhk.com";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** Ensure a profile row exists (defaults: automation on, cross-post off). */
export async function ensureUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserScopes> {
  const { data: existing } = await supabase
    .from("user_profiles")
    .select("access_automation, access_platform_sync_post")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return {
      access_automation: !!existing.access_automation,
      access_platform_sync_post: !!existing.access_platform_sync_post,
    };
  }

  const defaults: UserScopes = {
    access_automation: true,
    access_platform_sync_post: false,
  };

  // Insert may fail under RLS if somehow race; try admin fallback
  const { data: inserted, error } = await supabase
    .from("user_profiles")
    .insert({
      user_id: userId,
      ...defaults,
    })
    .select("access_automation, access_platform_sync_post")
    .maybeSingle();

  if (!error && inserted) {
    return {
      access_automation: !!inserted.access_automation,
      access_platform_sync_post: !!inserted.access_platform_sync_post,
    };
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("user_profiles")
      .upsert({ user_id: userId, ...defaults }, { onConflict: "user_id" })
      .select("access_automation, access_platform_sync_post")
      .single();
    if (data) {
      return {
        access_automation: !!data.access_automation,
        access_platform_sync_post: !!data.access_platform_sync_post,
      };
    }
  } catch {
    // fall through
  }

  return defaults;
}

export async function getUserScopes(
  supabase: SupabaseClient,
  user: User,
): Promise<UserScopes> {
  return ensureUserProfile(supabase, user.id);
}

export async function getProductMode(
  scopes: UserScopes,
): Promise<ProductMode | null> {
  const hasA = scopes.access_automation;
  const hasC = scopes.access_platform_sync_post;
  if (!hasA && !hasC) return null;
  if (hasA && !hasC) return "automation";
  if (!hasA && hasC) return "cross_post";

  const jar = await cookies();
  const pref = jar.get(PRODUCT_COOKIE)?.value;
  if (pref === "automation" || pref === "cross_post") return pref;
  return null; // both — need picker
}

export function hasBothProducts(scopes: UserScopes): boolean {
  return scopes.access_automation && scopes.access_platform_sync_post;
}
