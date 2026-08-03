/**
 * Generic MCP Streamable HTTP / JSON-RPC client.
 *
 * Supports the MCP 2025-03-26 streamable HTTP transport:
 *  1. POST initialize -> capture Mcp-Session-Id
 *  2. POST notifications/initialized
 *  3. POST tools/call
 */

export interface McpCallOptions {
  secret?: string;
  /** Skip initialize when reusing a session. */
  sessionId?: string;
  timeoutMs?: number;
}

export interface McpToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  sessionId?: string;
  raw?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

let rpcId = 1;

function nextId(): number {
  return rpcId++;
}

function authHeaders(secret?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (secret) h.Authorization = `Bearer ${secret}`;
  return h;
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!text) return null;

  if (ct.includes("application/json")) {
    return JSON.parse(text) as unknown;
  }

  // SSE or mixed: take last data: line with JSON
  if (ct.includes("text/event-stream") || text.startsWith("event:")) {
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          try {
            return JSON.parse(payload) as unknown;
          } catch {
            continue;
          }
        }
      }
    }
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractToolContent(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;

  const r = result as {
    content?: Array<{ type?: string; text?: string; data?: unknown }>;
    structuredContent?: unknown;
  };

  if (r.structuredContent !== undefined) return r.structuredContent;

  const content = r.content;
  if (Array.isArray(content) && content.length > 0) {
    const texts = content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);
    if (texts.length === 1) {
      try {
        return JSON.parse(texts[0]);
      } catch {
        return texts[0];
      }
    }
    if (texts.length > 1) return texts.join("\n");
  }

  return result;
}

async function jsonRpc(
  baseUrl: string,
  method: string,
  params: unknown,
  opts: McpCallOptions,
): Promise<{ body: JsonRpcResponse; sessionId?: string }> {
  const headers = authHeaders(opts.secret);
  if (opts.sessionId) headers["Mcp-Session-Id"] = opts.sessionId;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 120_000,
  );

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId(),
        method,
        params,
      }),
      signal: controller.signal,
    });

    const sessionId =
      res.headers.get("Mcp-Session-Id") ?? opts.sessionId ?? undefined;
    const parsed = (await parseResponseBody(res)) as JsonRpcResponse;

    if (!res.ok) {
      const msg =
        parsed?.error?.message ||
        (typeof parsed === "string" ? parsed : JSON.stringify(parsed));
      throw new Error(`MCP HTTP ${res.status}: ${msg}`);
    }

    return { body: parsed, sessionId };
  } finally {
    clearTimeout(timer);
  }
}

async function ensureSession(
  baseUrl: string,
  opts: McpCallOptions,
): Promise<string | undefined> {
  if (opts.sessionId) return opts.sessionId;

  const init = await jsonRpc(
    baseUrl,
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "9share-cross-post", version: "1.0.0" },
    },
    opts,
  );

  const sessionId = init.sessionId;
  if (sessionId) {
    await jsonRpc(
      baseUrl,
      "notifications/initialized",
      {},
      { ...opts, sessionId },
    ).catch(() => {});
  }

  return sessionId;
}

/**
 * Call an MCP tool via streamable HTTP JSON-RPC.
 */
export async function callMcpTool(
  baseUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  opts: McpCallOptions = {},
): Promise<McpToolResult> {
  try {
    const sessionId = await ensureSession(baseUrl, opts);

    const { body, sessionId: sid } = await jsonRpc(
      baseUrl,
      "tools/call",
      { name: toolName, arguments: args },
      { ...opts, sessionId },
    );

    if (body.error) {
      return {
        ok: false,
        error: body.error.message || JSON.stringify(body.error),
        sessionId: sid,
        raw: body,
      };
    }

    return {
      ok: true,
      data: extractToolContent(body.result),
      sessionId: sid,
      raw: body,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
