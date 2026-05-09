/**
 * Outbound MCP client — calls *remote* MCP servers (Reacher's, Nia's, etc.).
 *
 * Mirror image of `app/api/mcp/route.ts` (which serves our own MCP). This one
 * speaks the streamable-HTTP transport as a client so registered specialists
 * with `mcp_endpoint` set can have bid/execute forwarded to them.
 *
 * Stateless usage (no session-id tracking) — sufficient for tools/list +
 * tools/call against any compliant server.
 */

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface RemoteMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolsListResult {
  tools: RemoteMcpTool[];
}

export interface ToolCallResult {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
}

let nextId = 1;

async function rpc<T>(
  url: string,
  method: string,
  params?: Record<string, unknown>,
  timeoutMs = 15_000,
  apiKey?: string,
): Promise<T> {
  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextId++,
    method,
    params,
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) {
      throw new Error(`MCP ${method} → ${url} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    // Some MCP servers return text/event-stream even for single-shot responses.
    const ct = res.headers.get("content-type") ?? "";
    let envelope: JsonRpcResponse<T>;
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      // Take the first `data:` line.
      const line = text.split("\n").find((l) => l.startsWith("data:"));
      if (!line) throw new Error("MCP SSE response had no data line");
      envelope = JSON.parse(line.slice(5).trim()) as JsonRpcResponse<T>;
    } else {
      envelope = (await res.json()) as JsonRpcResponse<T>;
    }
    if (envelope.error) {
      throw new Error(
        `MCP ${method} error ${envelope.error.code}: ${envelope.error.message}`,
      );
    }
    return envelope.result as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverTools(
  url: string,
  apiKey?: string,
): Promise<RemoteMcpTool[]> {
  // Conventional handshake first; many servers tolerate skipping but a few require it.
  try {
    await rpc(
      url,
      "initialize",
      {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "agent-auction", version: "0.1.0" },
        capabilities: {},
      },
      8_000,
      apiKey,
    );
  } catch {
    // Tolerate servers that don't require initialize.
  }
  const result = await rpc<ToolsListResult>(url, "tools/list", {}, 12_000, apiKey);
  return result.tools ?? [];
}

export async function callRemoteTool(
  url: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs = 30_000,
  apiKey?: string,
): Promise<ToolCallResult> {
  return await rpc<ToolCallResult>(
    url,
    "tools/call",
    { name, arguments: args },
    timeoutMs,
    apiKey,
  );
}

/** Compact tool-call result text from MCP `content` blocks. */
export function flattenToolResult(r: ToolCallResult): string {
  return r.content
    .map((b) => (typeof b.text === "string" ? b.text : JSON.stringify(b)))
    .join("\n");
}
