import Link from "next/link";
import { LinkedInIcon } from "@/components/icons";

export function LinkedInConnectButton({
  label = "Connect LinkedIn",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/api/linkedin/connect"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0A66C2] px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition-opacity duration-200 hover:opacity-90 cursor-pointer ${className}`}
    >
      <LinkedInIcon className="h-5 w-5" />
      {label}
    </Link>
  );
}
