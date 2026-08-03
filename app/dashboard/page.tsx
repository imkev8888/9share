import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ConnectButton } from "@/components/connect-button";
import { StatusPill } from "@/components/status-pill";
import {
  InstagramIcon,
  FacebookIcon,
  BoltIcon,
  MessageIcon,
  CheckIcon,
  PlusIcon,
  TargetIcon,
} from "@/components/icons";
import { MediaThumb } from "@/components/media-thumb";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; reason?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();

  const [
    { data: account },
    { data: fbPages },
    { count: activeCount },
    { count: sentCount },
    { data: recent },
  ] = await Promise.all([
    supabase
      .from("instagram_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("facebook_pages")
      .select("id, page_name, picture_url")
      .eq("user_id", user.id),
    supabase
      .from("automations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("automation_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "sent"),
    supabase
      .from("automation_logs")
      .select(
        "id, commenter_username, comment_text, status, error, created_at, fb_page_id",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Overview
        </h1>
        <p className="text-sm text-ink-soft">
          Welcome back — here&apos;s how your automations are doing.
        </p>
      </div>

      {sp.connect === "success" && (
        <div className="flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800">
          <CheckIcon className="h-4 w-4" /> Instagram connected successfully.
        </div>
      )}
      {sp.connect === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Couldn&apos;t connect: {sp.reason || "unknown error"}
        </div>
      )}

      {!account && (fbPages ?? []).length > 0 && (
        <Link
          href="/dashboard/channels"
          className="glass flex items-center justify-between gap-3 rounded-3xl p-5 transition-colors duration-200 hover:bg-white/85 cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="inline-flex rounded-2xl bg-[#1877F2] p-3 text-white">
              <FacebookIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-ink">
                {fbPages!.length} Facebook{" "}
                {fbPages!.length === 1 ? "Page" : "Pages"} connected
              </p>
              <p className="text-sm text-ink-soft">Manage your channels</p>
            </div>
          </div>
          <span className="text-brand-500">→</span>
        </Link>
      )}

      {!account ? (
        <div className="glass-strong rounded-3xl p-8 text-center sm:p-12">
          <div className="mx-auto mb-5 inline-flex rounded-2xl bg-gradient-to-br from-brand-500 to-[var(--color-cyan-cta)] p-4 text-white">
            <InstagramIcon className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-extrabold text-ink">
            Connect your Instagram
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            One click — approve on Instagram and you&apos;re ready to automate.
            We use the official API; no passwords or tokens needed.
          </p>
          <div className="mt-6">
            <ConnectButton />
          </div>
          <p className="mt-4 text-xs text-ink-soft">
            Requires an Instagram Business or Creator account.
          </p>
        </div>
      ) : (
        <>
          {/* Account + stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="glass flex items-center gap-4 rounded-3xl p-5 sm:col-span-2 lg:col-span-1">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-brand-600">
                <MediaThumb
                  src={account.profile_picture_url}
                  alt={account.username ?? "profile"}
                  className="h-full w-full object-cover"
                  fallbackClassName="flex h-full w-full items-center justify-center text-white"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-bold text-ink">
                    @{account.username}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                    <CheckIcon className="h-3 w-3" /> Connected
                  </span>
                </div>
                <p className="truncate text-xs text-ink-soft">
                  {account.name ?? "Instagram account"}
                </p>
              </div>
            </div>

            {(fbPages ?? []).length > 0 && (
              <div className="glass flex items-center gap-4 rounded-3xl p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-white">
                  <FacebookIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-bold text-ink">
                      {fbPages!.length === 1
                        ? fbPages![0].page_name
                        : `${fbPages!.length} Facebook Pages`}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                      <CheckIcon className="h-3 w-3" /> Connected
                    </span>
                  </div>
                  <Link
                    href="/dashboard/channels"
                    className="text-xs text-ink-soft underline-offset-2 hover:underline"
                  >
                    Manage channels
                  </Link>
                </div>
              </div>
            )}

            <StatCard
              icon={<BoltIcon className="h-5 w-5" />}
              label="Active automations"
              value={activeCount ?? 0}
            />
            <StatCard
              icon={<MessageIcon className="h-5 w-5" />}
              label="DMs sent"
              value={sentCount ?? 0}
            />
          </div>

          {/* Quick action */}
          <Link
            href="/dashboard/automations/new"
            className="glass group flex items-center justify-between rounded-3xl p-5 transition-colors duration-200 hover:bg-white/85 cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="inline-flex rounded-2xl bg-brand-500 p-3 text-white">
                <PlusIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-ink">New automation</p>
                <p className="text-sm text-ink-soft">
                  Pick a post and set up its DM campaign
                </p>
              </div>
            </div>
            <span className="text-brand-500">→</span>
          </Link>

          {/* Recent activity */}
          <div className="glass rounded-3xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-ink">Recent activity</h2>
              <Link
                href="/dashboard/tracking"
                className="text-sm font-semibold text-brand-600 transition-colors duration-200 hover:text-brand-700 cursor-pointer"
              >
                View tracking →
              </Link>
            </div>
            {recent && recent.length > 0 ? (
              <ul className="divide-y divide-white/60">
                {recent.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        @{log.commenter_username ?? "someone"}
                      </p>
                      <p className="truncate text-xs text-ink-soft">
                        {log.comment_text ?? "—"}
                      </p>
                    </div>
                    <StatusPill status={log.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <TargetIcon className="h-8 w-8 text-brand-300" />
                <p className="mt-2 text-sm text-ink-soft">
                  No DMs sent yet. Create an automation and watch it light up.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-3 inline-flex rounded-xl bg-brand-50 p-2 text-brand-600">
        {icon}
      </div>
      <p className="text-3xl font-extrabold text-ink">{value}</p>
      <p className="text-sm text-ink-soft">{label}</p>
    </div>
  );
}
