/**
 * Xiaohongshu (RedNote) MCP client.
 *
 * Env:
 *  - XHS_MCP_URL (default http://localhost:18060/mcp)
 *  - XHS_MCP_SECRET (optional Bearer token)
 */

import { callMcpTool } from "./http";

function baseUrl(): string {
  return process.env.XHS_MCP_URL || "http://localhost:18060/mcp";
}

function secret(): string | undefined {
  return process.env.XHS_MCP_SECRET || undefined;
}

export interface XhsLoginQrcode {
  qrcode_url?: string;
  qrcode_base64?: string;
  expires_in?: number;
  [key: string]: unknown;
}

export interface XhsLoginStatus {
  logged_in?: boolean;
  username?: string;
  status?: string;
  [key: string]: unknown;
}

export interface XhsPublishInput {
  title: string;
  content: string;
  tags?: string[];
  /** Local paths or HTTP(S) URLs — MCP tool arg name is `images`. */
  images?: string[];
  [key: string]: unknown;
}

export interface XhsPublishResult {
  ok: boolean;
  post_id?: string;
  permalink?: string;
  error?: string;
  raw?: unknown;
}

export async function getLoginQrcode(): Promise<{
  ok: boolean;
  data?: XhsLoginQrcode;
  error?: string;
}> {
  const res = await callMcpTool(baseUrl(), "get_login_qrcode", {}, {
    secret: secret(),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: res.data as XhsLoginQrcode };
}

export async function checkLoginStatus(): Promise<{
  ok: boolean;
  data?: XhsLoginStatus;
  error?: string;
}> {
  const res = await callMcpTool(baseUrl(), "check_login_status", {}, {
    secret: secret(),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: res.data as XhsLoginStatus };
}

/** Publish image/carousel 图文 content. */
export async function publishContent(
  input: XhsPublishInput,
): Promise<XhsPublishResult> {
  const res = await callMcpTool(baseUrl(), "publish_content", input, {
    secret: secret(),
  });
  if (!res.ok) return { ok: false, error: res.error, raw: res.raw };

  const data = res.data as Record<string, unknown> | undefined;
  return {
    ok: true,
    post_id:
      (data?.post_id as string | undefined) ||
      (data?.note_id as string | undefined),
    permalink:
      (data?.permalink as string | undefined) ||
      (data?.url as string | undefined),
    raw: res.raw,
  };
}

/** Publish video note via dedicated MCP tool. */
export async function publishWithVideo(
  input: XhsPublishInput & { video: string },
): Promise<XhsPublishResult> {
  const res = await callMcpTool(baseUrl(), "publish_with_video", input, {
    secret: secret(),
  });
  if (!res.ok) return { ok: false, error: res.error, raw: res.raw };

  const data = res.data as Record<string, unknown> | undefined;
  return {
    ok: true,
    post_id:
      (data?.post_id as string | undefined) ||
      (data?.note_id as string | undefined),
    permalink:
      (data?.permalink as string | undefined) ||
      (data?.url as string | undefined),
    raw: res.raw,
  };
}
