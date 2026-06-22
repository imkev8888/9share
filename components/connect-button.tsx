import Link from "next/link";
import { InstagramIcon } from "@/components/icons";

export function ConnectButton({
  label = "Connect Instagram",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/api/instagram/connect"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-[var(--color-cyan-cta)] px-6 py-3 font-bold text-white shadow-lg shadow-brand-500/20 transition-opacity duration-200 hover:opacity-90 cursor-pointer ${className}`}
    >
      <InstagramIcon className="h-5 w-5" />
      {label}
    </Link>
  );
}
