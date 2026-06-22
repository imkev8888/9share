"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  icon,
  children,
  mobile = false,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const active =
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  if (mobile) {
    return (
      <Link
        href={href}
        className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-semibold leading-none transition-colors duration-200 cursor-pointer ${
          active ? "bg-brand-500 text-white" : "text-ink-soft"
        }`}
      >
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200 cursor-pointer ${
        active
          ? "bg-brand-500 text-white shadow-sm"
          : "text-ink-soft hover:bg-white/60 hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
