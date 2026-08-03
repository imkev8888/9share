import { requireUserWithScopes } from "@/lib/auth";
import { ProductPicker } from "@/components/product-picker";
import { redirect } from "next/navigation";

export default async function SelectProductPage() {
  const { scopes, admin } = await requireUserWithScopes();
  const automation = scopes.access_automation || admin;
  const crossPost = scopes.access_platform_sync_post || admin;

  if (!automation && !crossPost) redirect("/dashboard/no-access");
  if (automation && !crossPost) redirect("/dashboard");
  if (!automation && crossPost) redirect("/dashboard/cross-post");

  return <ProductPicker automation={automation} crossPost={crossPost} />;
}
