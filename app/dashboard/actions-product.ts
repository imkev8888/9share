"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PRODUCT_COOKIE, type ProductMode } from "@/lib/scopes";
import { requireUserWithScopes } from "@/lib/auth";

export async function chooseAutomation() {
  await selectProduct("automation");
}

export async function chooseCrossPost() {
  await selectProduct("cross_post");
}

export async function selectProduct(mode: ProductMode) {
  const { scopes, admin } = await requireUserWithScopes();
  if (mode === "automation" && !scopes.access_automation && !admin) {
    redirect("/dashboard/no-access");
  }
  if (mode === "cross_post" && !scopes.access_platform_sync_post && !admin) {
    redirect("/dashboard/no-access");
  }

  const jar = await cookies();
  jar.set(PRODUCT_COOKIE, mode, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(mode === "cross_post" ? "/dashboard/cross-post" : "/dashboard");
}

export async function clearProductSelection() {
  await requireUserWithScopes();
  const jar = await cookies();
  jar.delete(PRODUCT_COOKIE);
  redirect("/dashboard/select");
}
