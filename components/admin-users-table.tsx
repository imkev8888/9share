"use client";

import { useTransition } from "react";
import { updateUserScopes } from "@/app/dashboard/admin/actions";

export type AdminUserRow = {
  userId: string;
  email: string;
  accessAutomation: boolean;
  accessPlatformSyncPost: boolean;
};

export function AdminUsersTable({ rows }: { rows: AdminUserRow[] }) {
  const [pending, startTransition] = useTransition();

  function toggle(
    row: AdminUserRow,
    field: "accessAutomation" | "accessPlatformSyncPost",
    value: boolean,
  ) {
    startTransition(async () => {
      await updateUserScopes(
        row.userId,
        field === "accessAutomation" ? value : row.accessAutomation,
        field === "accessPlatformSyncPost" ? value : row.accessPlatformSyncPost,
      );
    });
  }

  return (
    <div className="glass overflow-hidden rounded-3xl">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/50 bg-white/40 text-xs uppercase tracking-wide text-ink-soft">
          <tr>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">DM Automation</th>
            <th className="px-4 py-3 font-semibold">Cross Post</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/50">
          {rows.map((row) => (
            <tr key={row.userId}>
              <td className="px-4 py-3 font-medium text-ink">{row.email}</td>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={row.accessAutomation}
                  disabled={pending}
                  onChange={(e) =>
                    toggle(row, "accessAutomation", e.target.checked)
                  }
                  className="h-4 w-4 cursor-pointer accent-[var(--color-brand-500)]"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={row.accessPlatformSyncPost}
                  disabled={pending}
                  onChange={(e) =>
                    toggle(row, "accessPlatformSyncPost", e.target.checked)
                  }
                  className="h-4 w-4 cursor-pointer accent-[var(--color-brand-500)]"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-ink-soft">
          No users found.
        </p>
      )}
    </div>
  );
}
