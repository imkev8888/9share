"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, WeChatIcon } from "@/components/icons";

interface WechatStatus {
  ready?: boolean;
  status?: string;
  connection?: { status?: string; meta?: { device_name?: string } };
  error?: string;
}

export function WeChatChannelCard() {
  const [status, setStatus] = useState<WechatStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp/wechat/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ error: "Could not reach WeChat MCP" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const ready = status?.ready || status?.connection?.status === "ready";
  const deviceName = status?.connection?.meta?.device_name;

  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="inline-flex rounded-2xl bg-[#07C160] p-2.5 text-white">
          <WeChatIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">WeChat Moments</h2>
          <p className="text-xs text-ink-soft">Company / shared account</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/60 p-4">
        {loading ? (
          <p className="text-sm text-ink-soft">Checking device…</p>
        ) : ready ? (
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-800">
            <CheckIcon className="h-4 w-4" />
            Ready{deviceName ? ` — ${deviceName}` : ""}
          </div>
        ) : (
          <p className="text-sm font-medium text-amber-700">Not ready</p>
        )}

        {status?.error && (
          <p className="mt-2 text-xs text-red-600">{status.error}</p>
        )}

        <button
          type="button"
          onClick={refreshStatus}
          className="mt-3 rounded-xl px-4 py-2 text-xs font-semibold text-ink-soft transition-colors hover:bg-white/80 cursor-pointer"
        >
          Refresh status
        </button>
      </div>
    </div>
  );
}
