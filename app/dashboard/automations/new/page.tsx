import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMedia, type IgMedia } from "@/lib/instagram";
import { ConnectButton } from "@/components/connect-button";
import { AutomationBuilder } from "@/components/automation-builder";

export default async function NewAutomationPage() {
  const { supabase, user } = await requireUser();

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("id, access_token, username")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-lg font-bold text-ink">Connect Instagram first</h2>
        <div className="mt-5">
          <ConnectButton />
        </div>
      </div>
    );
  }

  let media: IgMedia[] = [];
  let loadError: string | null = null;
  try {
    media = await getMedia(account.access_token, 30);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load posts";
  }

  // Which posts already have an automation?
  const { data: existing } = await supabase
    .from("automations")
    .select("ig_media_id")
    .eq("account_id", account.id);
  const usedMediaIds = new Set((existing ?? []).map((e) => e.ig_media_id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/automations"
          className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:bg-white/60 hover:text-ink cursor-pointer"
        >
          ← Back
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            New automation
          </h1>
          <p className="text-sm text-ink-soft">
            Pick a post from @{account.username}, then write the DM.
          </p>
        </div>
      </div>

      {loadError ? (
        <div className="glass-strong rounded-3xl p-8 text-center">
          <p className="text-sm font-medium text-red-700">
            Couldn&apos;t load your posts: {loadError}
          </p>
          <p className="mt-2 text-xs text-ink-soft">
            Try reconnecting your Instagram account.
          </p>
        </div>
      ) : (
        <AutomationBuilder
          accountId={account.id}
          media={media}
          usedMediaIds={Array.from(usedMediaIds)}
        />
      )}
    </div>
  );
}
