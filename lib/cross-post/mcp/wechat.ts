/**
 * WeChat Moments MCP client (SSE transport).
 *
 * Flow:
 *  1. GET SSE endpoint -> read `endpoint` event for message POST URL
 *  2. POST JSON-RPC messages to that endpoint
 *
 * Env:
 *  - WECHAT_MCP_URL (default http://localhost:8765/sse)
 *  - WECHAT_MCP_SECRET (optional Bearer token)
 */

import { callMcpTool } from "./http";

function sseUrl(): string {
  return process.env.WECHAT_MCP_URL || "http://localhost:8765/sse";
}

function secret(): string | undefined {
  return process.env.WECHAT_MCP_SECRET || undefined;
}

/** Resolve the MCP message endpoint from the SSE handshake. */
export async function resolveMessageEndpoint(
  sseBaseUrl?: string,
): Promise<string> {
  const url = sseBaseUrl ?? sseUrl();
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (secret()) headers.Authorization = `Bearer ${secret()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`WeChat MCP SSE failed: HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("WeChat MCP SSE: empty body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const lines = block.split("\n");
        let event = "";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data = line.slice(5).trim();
        }

        if (event === "endpoint" && data) {
          controller.abort();
          // Relative endpoint paths are resolved against the SSE origin.
          if (data.startsWith("http")) return data;
          const origin = new URL(url).origin;
          return `${origin}${data.startsWith("/") ? "" : "/"}${data}`;
        }
      }
    }

    throw new Error("WeChat MCP SSE: no endpoint event received");
  } finally {
    clearTimeout(timer);
  }
}

let cachedEndpoint: string | null = null;

async function messageBaseUrl(): Promise<string> {
  if (cachedEndpoint) return cachedEndpoint;
  cachedEndpoint = await resolveMessageEndpoint();
  return cachedEndpoint;
}

export interface WechatDeviceStatus {
  connected?: boolean;
  device_name?: string;
  status?: string;
  [key: string]: unknown;
}

export interface WechatPrepareInput {
  text?: string;
  /** Image paths or URLs — MCP tool arg name is `images`. */
  images?: string[];
  [key: string]: unknown;
}

export interface WechatSubmitInput {
  /** Staged post id from prepare_post. */
  post_id?: string;
  text?: string;
  images?: string[];
  [key: string]: unknown;
}

export async function getDeviceStatus(): Promise<{
  ok: boolean;
  data?: WechatDeviceStatus;
  error?: string;
}> {
  const endpoint = await messageBaseUrl();
  const res = await callMcpTool(endpoint, "get_device_status", {}, {
    secret: secret(),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: res.data as WechatDeviceStatus };
}

export async function preparePost(input: WechatPrepareInput): Promise<{
  ok: boolean;
  post_id?: string;
  data?: unknown;
  error?: string;
}> {
  const endpoint = await messageBaseUrl();
  const res = await callMcpTool(endpoint, "prepare_post", input, {
    secret: secret(),
  });
  if (!res.ok) return { ok: false, error: res.error };

  const data = res.data as Record<string, unknown> | undefined;
  return {
    ok: true,
    post_id:
      (data?.post_id as string | undefined) ||
      (data?.draft_id as string | undefined),
    data: res.data,
  };
}

export async function submitPost(input: WechatSubmitInput): Promise<{
  ok: boolean;
  post_id?: string;
  error?: string;
  raw?: unknown;
}> {
  const endpoint = await messageBaseUrl();
  const res = await callMcpTool(endpoint, "submit_post", input, {
    secret: secret(),
  });
  if (!res.ok) return { ok: false, error: res.error, raw: res.raw };

  const data = res.data as Record<string, unknown> | undefined;
  return {
    ok: true,
    post_id:
      (data?.post_id as string | undefined) ||
      (data?.moment_id as string | undefined),
    raw: res.raw,
  };
}

/** Reset cached SSE endpoint (e.g. after MCP restart). */
export function resetWechatMcpSession(): void {
  cachedEndpoint = null;
}
