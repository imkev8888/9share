import Link from "next/link";
import { ThreadsIcon } from "@/components/icons";

export function ThreadsConnectButton({
  label = "Connect Threads",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/api/threads/connect"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-6 py-3 font-bold text-white shadow-lg shadow-black/10 transition-opacity duration-200 hover:opacity-90 cursor-pointer ${className}`}
    >
      <ThreadsIcon className="h-5 w-5" />
      {label}
    </Link>
  );
}
