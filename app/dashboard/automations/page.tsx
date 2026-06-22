import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConnectButton } from "@/components/connect-button";
import { AutomationRow } from "@/components/automation-row";
import { PlusIcon, BoltIcon } from "@/components/icons";

export default async function AutomationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("id")
    .eq("user_id", user!.id)
    .maybeSingle();

  const { data: automations } = await supabase
    .from("automations")
    .select(
      "id, name, keyword, dm_message, media_thumbnail, media_permalink, is_active, sent_count",
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Automations
          </h1>
          <p className="text-sm text-ink-soft">
            One campaign per post. Toggle on or off anytime.
          </p>
        </div>
        {account && (
          <Link
            href="/dashboard/automations/new"
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-cyan-cta)] px-5 py-2.5 font-bold text-white shadow-sm transition-colors duration-200 hover:bg-[var(--color-cyan-cta-dark)] cursor-pointer"
          >
            <PlusIcon className="h-5 w-5" />
            New automation
          </Link>
        )}
      </div>

      {!account ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <h2 className="text-lg font-bold text-ink">
            Connect Instagram first
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            You need a connected account before creating automations.
          </p>
          <div className="mt-5">
            <ConnectButton />
          </div>
        </div>
      ) : automations && automations.length > 0 ? (
        <div className="space-y-3">
          {automations.map((a) => (
            <AutomationRow key={a.id} automation={a} />
          ))}
        </div>
      ) : (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-brand-50 p-3 text-brand-500">
            <BoltIcon className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-ink">No automations yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Create your first one — pick a post, write a DM, and 9share handles
            the rest.
          </p>
          <Link
            href="/dashboard/automations/new"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--color-cyan-cta)] px-5 py-2.5 font-bold text-white transition-colors duration-200 hover:bg-[var(--color-cyan-cta-dark)] cursor-pointer"
          >
            <PlusIcon className="h-5 w-5" />
            Create automation
          </Link>
        </div>
      )}
    </div>
  );
}
