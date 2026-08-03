import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProductMode,
  getUserScopes,
  isAdminEmail,
  type ProductMode,
  type UserScopes,
} from "@/lib/scopes";

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
});

export async function requireUser() {
  const session = await getSessionUser();
  if (!session.user) redirect("/login");
  return { supabase: session.supabase, user: session.user };
}

export async function requireUserWithScopes() {
  const { supabase, user } = await requireUser();
  const raw = await getUserScopes(supabase, user);
  const admin = isAdminEmail(user.email);
  // Admins can use both products regardless of profile flags.
  const scopes: UserScopes = admin
    ? { access_automation: true, access_platform_sync_post: true }
    : raw;
  const product = await getProductMode(scopes);
  return { supabase, user, scopes, product, admin, rawScopes: raw };
}

export async function requireScope(scope: keyof UserScopes) {
  const ctx = await requireUserWithScopes();
  if (!ctx.scopes[scope] && !ctx.admin) {
    redirect("/dashboard/no-access");
  }
  return ctx;
}

export async function requireAdmin() {
  const ctx = await requireUserWithScopes();
  if (!ctx.admin) redirect("/dashboard");
  return ctx;
}

export type { ProductMode, UserScopes };

/** API routes — returns null when unauthenticated. */
export async function getApiUserWithScopes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const raw = await getUserScopes(supabase, user);
  const admin = isAdminEmail(user.email);
  const scopes: UserScopes = admin
    ? { access_automation: true, access_platform_sync_post: true }
    : raw;
  return { supabase, user, scopes, admin, rawScopes: raw };
}
