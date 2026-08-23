import Link from "next/link";
import { RefreshIcon } from "@/components/icons";

const CONNECT_PATH = {
  instagram: "/api/instagram/connect",
  facebook: "/api/facebook/connect",
  threads: "/api/threads/connect",
  linkedin: "/api/linkedin/connect",
} as const;

/**
 * Re-runs the OAuth flow for an already connected channel, so an expired token
 * can be refreshed without disconnecting first (which used to be the only way).
 */
export function ChannelReconnectButton({
  platform,
  name,
}: {
  platform: keyof typeof CONNECT_PATH;
  name: string;
}) {
  return (
    <Link
      href={CONNECT_PATH[platform]}
      title={`Reconnect ${name}`}
      aria-label={`Reconnect ${name}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors duration-200 hover:bg-brand-50 cursor-pointer"
    >
      <RefreshIcon className="h-3.5 w-3.5" />
      Reconnect
    </Link>
  );
}
