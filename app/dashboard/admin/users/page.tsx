import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminUsersTable } from "@/components/admin-users-table";

export default async function AdminUsersPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: profiles }, { data: authData }] = await Promise.all([
    admin
      .from("user_profiles")
      .select(
        "user_id, access_automation, access_platform_sync_post, updated_at",
      )
      .order("updated_at", { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  const rows = (profiles ?? []).map((p) => ({
    userId: p.user_id as string,
    email: emailById.get(p.user_id as string) || "(unknown)",
    accessAutomation: !!p.access_automation,
    accessPlatformSyncPost: !!p.access_platform_sync_post,
  }));

  // Include auth users missing a profile row
  for (const u of authData?.users ?? []) {
    if (!rows.some((r) => r.userId === u.id)) {
      rows.push({
        userId: u.id,
        email: u.email ?? "(unknown)",
        accessAutomation: true,
        accessPlatformSyncPost: false,
      });
    }
  }

  rows.sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          User scopes
        </h1>
        <p className="text-sm text-ink-soft">
          Grant DM Automation or Cross Post access. New users default to
          Automation only.
        </p>
      </div>
      <AdminUsersTable rows={rows} />
    </div>
  );
}
