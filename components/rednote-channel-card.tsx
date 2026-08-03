"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, RedNoteIcon } from "@/components/icons";

interface RedNoteStatus {
  logged_in?: boolean;
  status?: string;
  connection?: { status?: string; meta?: { username?: string } };
  error?: string;
}

interface QrData {
  qrcode_url?: string;
  qrcode_base64?: string;
  expires_in?: number;
  instructions?: string;
}

export function RedNoteChannelCard() {
  const [status, setStatus] = useState<RedNoteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<QrData | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp/rednote/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ error: "Could not reach RedNote MCP" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  async function showQr() {
    setQrLoading(true);
    setQrError(null);
    try {
      const res = await fetch("/api/mcp/rednote/qr");
      const data = await res.json();
      if (!res.ok) {
        setQrError(data.error ?? "Failed to load QR code");
        setQr(null);
      } else {
        setQr(data);
      }
    } catch {
      setQrError("Could not fetch QR code");
    } finally {
      setQrLoading(false);
    }
  }

  const connected =
    status?.logged_in || status?.connection?.status === "connected";
  const username = status?.connection?.meta?.username;

  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="inline-flex rounded-2xl bg-[#FF2442] p-2.5 text-white">
          <RedNoteIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">RedNote</h2>
          <p className="text-xs text-ink-soft">Company / shared account</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/60 p-4">
        {loading ? (
          <p className="text-sm text-ink-soft">Checking status…</p>
        ) : connected ? (
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-800">
            <CheckIcon className="h-4 w-4" />
            Logged in{username ? ` as ${username}` : ""}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            {status?.error ?? "Not logged in — scan QR to connect."}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={showQr}
            disabled={qrLoading}
            className="rounded-xl bg-[#FF2442] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            {qrLoading ? "Loading QR…" : "Show login QR"}
          </button>
          <button
            type="button"
            onClick={refreshStatus}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-ink-soft transition-colors hover:bg-white/80 cursor-pointer"
          >
            Refresh status
          </button>
        </div>

        {qrError && (
          <p className="mt-3 text-xs font-medium text-red-600">{qrError}</p>
        )}

        {qr && (
          <div className="mt-4 space-y-2 text-center">
            {qr.qrcode_base64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  qr.qrcode_base64.startsWith("data:")
                    ? qr.qrcode_base64
                    : `data:image/png;base64,${qr.qrcode_base64}`
                }
                alt="RedNote login QR"
                className="mx-auto max-h-48 rounded-xl"
              />
            ) : qr.qrcode_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr.qrcode_url}
                alt="RedNote login QR"
                className="mx-auto max-h-48 rounded-xl"
              />
            ) : (
              <p className="text-xs text-ink-soft">
                Open the RedNote app and scan the QR shown in your MCP server
                console.
              </p>
            )}
            <p className="text-xs text-ink-soft">
              Scan with the RedNote app, then click Refresh status.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
