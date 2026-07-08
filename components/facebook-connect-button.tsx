import Link from "next/link";
import { FacebookIcon } from "@/components/icons";

export function FacebookConnectButton({
  label = "Connect Facebook Page",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/api/facebook/connect"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1877F2] px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition-opacity duration-200 hover:opacity-90 cursor-pointer ${className}`}
    >
      <FacebookIcon className="h-5 w-5" />
      {label}
    </Link>
  );
}
