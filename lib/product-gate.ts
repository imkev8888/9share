import { redirect } from "next/navigation";
import { requireUserWithScopes } from "@/lib/auth";

/** Gate automation pages; redirect to picker / cross-post / no-access as needed. */
export async function requireAutomationAccess() {
  const ctx = await requireUserWithScopes();
  if (!ctx.scopes.access_automation) {
    if (ctx.scopes.access_platform_sync_post) redirect("/dashboard/cross-post");
    redirect("/dashboard/no-access");
  }
  if (ctx.product === null) redirect("/dashboard/select");
  if (ctx.product === "cross_post") redirect("/dashboard/cross-post");
  return ctx;
}

/** Gate Cross Post pages. */
export async function requireCrossPostAccess() {
  const ctx = await requireUserWithScopes();
  if (!ctx.scopes.access_platform_sync_post) {
    if (ctx.scopes.access_automation) redirect("/dashboard");
    redirect("/dashboard/no-access");
  }
  if (ctx.product === null) redirect("/dashboard/select");
  if (ctx.product === "automation") redirect("/dashboard");
  return ctx;
}

/** Channels: allow either product when mode is set; show picker if both and unset. */
export async function requireAnyProductAccess() {
  const ctx = await requireUserWithScopes();
  if (!ctx.scopes.access_automation && !ctx.scopes.access_platform_sync_post) {
    redirect("/dashboard/no-access");
  }
  if (ctx.product === null) redirect("/dashboard/select");
  return ctx;
}
