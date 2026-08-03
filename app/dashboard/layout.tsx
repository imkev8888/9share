import Link from "next/link";
import { requireUserWithScopes } from "@/lib/auth";
import { hasBothProducts } from "@/lib/scopes";
import { signOut } from "./actions";
import { clearProductSelection } from "./actions-product";
import {
  Logo,
  ChartIcon,
  BoltIcon,
  LinkIcon,
  MessageIcon,
  SheetIcon,
  LogoutIcon,
  SendIcon,
  ShieldIcon,
} from "@/components/icons";
import { LegalLinks } from "@/components/legal-links";
import { NavLink } from "@/components/nav-link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, scopes, product, admin } = await requireUserWithScopes();
  const mode = product;
  const both = hasBothProducts(scopes);

  const automationNav = (
    <>
      <NavLink href="/dashboard" icon={<ChartIcon className="h-5 w-5" />}>
        Overview
      </NavLink>
      <NavLink
        href="/dashboard/channels"
        icon={<LinkIcon className="h-5 w-5" />}
      >
        Channels
      </NavLink>
      <NavLink
        href="/dashboard/automations"
        icon={<BoltIcon className="h-5 w-5" />}
      >
        Automations
      </NavLink>
      <NavLink
        href="/dashboard/tracking"
        icon={<SheetIcon className="h-5 w-5" />}
      >
        Tracking
      </NavLink>
      <NavLink
        href="/dashboard/logs"
        icon={<MessageIcon className="h-5 w-5" />}
      >
        Activity
      </NavLink>
    </>
  );

  const crossPostNav = (
    <>
      <NavLink
        href="/dashboard/cross-post"
        icon={<SendIcon className="h-5 w-5" />}
      >
        Cross Post
      </NavLink>
      <NavLink
        href="/dashboard/channels"
        icon={<LinkIcon className="h-5 w-5" />}
      >
        Channels
      </NavLink>
    </>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6">
      <aside className="glass sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col rounded-3xl p-5 md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
          <Logo className="h-9 w-9" />
          <span className="text-xl font-extrabold tracking-tight text-ink">
            9share
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {mode === "cross_post"
            ? crossPostNav
            : mode === "automation"
              ? automationNav
              : null}
          {admin && (
            <NavLink
              href="/dashboard/admin/users"
              icon={<ShieldIcon className="h-5 w-5" />}
            >
              Admin
            </NavLink>
          )}
        </nav>

        <div className="mt-4 border-t border-white/50 pt-4">
          {both && (
            <form action={clearProductSelection}>
              <button
                type="submit"
                className="mb-2 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-brand-600 hover:bg-white/60 cursor-pointer"
              >
                Switch product
              </button>
            </form>
          )}
          <p className="truncate px-2 text-xs text-ink-soft">{user.email}</p>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:bg-white/60 hover:text-ink cursor-pointer"
            >
              <LogoutIcon className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex w-full min-w-0 flex-col">
        <header className="glass mb-6 flex items-center justify-between rounded-2xl px-4 py-3 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="font-extrabold text-ink">9share</span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg p-2 text-ink-soft hover:bg-white/60 cursor-pointer"
              aria-label="Sign out"
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </form>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-8 space-y-3 text-center">
          <p className="text-xs text-ink-soft">
            Created by Kelvin Ng with love.
          </p>
          <LegalLinks />
        </footer>

        {mode && (
          <nav className="glass sticky bottom-4 mt-6 flex items-center justify-around gap-1 rounded-2xl p-2 md:hidden">
            {mode === "cross_post" ? (
              <>
                <NavLink
                  href="/dashboard/cross-post"
                  icon={<SendIcon className="h-5 w-5" />}
                  mobile
                >
                  Post
                </NavLink>
                <NavLink
                  href="/dashboard/channels"
                  icon={<LinkIcon className="h-5 w-5" />}
                  mobile
                >
                  Channels
                </NavLink>
              </>
            ) : (
              <>
                <NavLink
                  href="/dashboard"
                  icon={<ChartIcon className="h-5 w-5" />}
                  mobile
                >
                  Overview
                </NavLink>
                <NavLink
                  href="/dashboard/channels"
                  icon={<LinkIcon className="h-5 w-5" />}
                  mobile
                >
                  Channels
                </NavLink>
                <NavLink
                  href="/dashboard/automations"
                  icon={<BoltIcon className="h-5 w-5" />}
                  mobile
                >
                  Autos
                </NavLink>
                <NavLink
                  href="/dashboard/tracking"
                  icon={<SheetIcon className="h-5 w-5" />}
                  mobile
                >
                  Track
                </NavLink>
                <NavLink
                  href="/dashboard/logs"
                  icon={<MessageIcon className="h-5 w-5" />}
                  mobile
                >
                  Activity
                </NavLink>
              </>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
