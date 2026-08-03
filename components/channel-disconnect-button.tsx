"use client";

import { useTransition } from "react";
import {
  disconnectInstagram,
  disconnectFacebookPage,
  disconnectThreads,
  disconnectLinkedIn,
} from "@/app/dashboard/actions";

export function ChannelDisconnectButton({
  platform,
  id,
  name,
}: {
  platform: "instagram" | "facebook" | "threads" | "linkedin";
  id: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();

  function onDisconnect() {
    if (!confirm(`Disconnect ${name}? Its automations will stop working.`))
      return;
    startTransition(async () => {
      if (platform === "instagram") await disconnectInstagram(id);
      else if (platform === "facebook") await disconnectFacebookPage(id);
      else if (platform === "threads") await disconnectThreads(id);
      else await disconnectLinkedIn(id);
    });
  }

  return (
    <button
      type="button"
      onClick={onDisconnect}
      disabled={pending}
      className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors duration-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60 cursor-pointer"
    >
      {pending ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
