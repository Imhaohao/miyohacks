/**
 * MCP endpoint — Model Context Protocol server over HTTP (stateless mode).
 *
 * Implements the streamable-HTTP transport's request/response shape directly
 * as JSON-RPC 2.0 so we don't need to adapt Next.js's `Request` to a Node
 * `IncomingMessage`. Stateless mode is sufficient for our four tools because
 * none of them require per-session server-side state.
 *
 * Compatible with `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport`
 * for tool discovery and invocation.
 */

import { NextRequest, NextResponse } from "next/server";
import { TOOLS, dispatchTool } from "@/lib/mcp-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = {
  name: "agent-auction-protocol",
  version: "0.1.0",
};

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function ok(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function err(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, data },
  });
}

async function handle(msg: JsonRpcRequest) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      });

    case "notifications/initialized":
      // No response for notifications.
      return null;

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      const name = params?.name as string | undefined;
      const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
      if (!name) return err(id, -32602, "missing tool name");
      try {
        const result = await dispatchTool(name, args);
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return ok(id, {
          content: [{ type: "text", text: `tool error: ${message}` }],
          isError: true,
        });
      }
    }

    case "ping":
      return ok(id, {});

    default:
      return err(id, -32601, `method not found: ${method}`);
  }
}

export async function POST(req: NextRequest) {
  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return err(null, -32700, "parse error");
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(handle))).filter(
      (r): r is NextResponse => r !== null,
    );
    if (responses.length === 0) {
      return new NextResponse(null, { status: 202 });
    }
    // For batched requests, return an array of the underlying JSON envelopes.
    const payloads = await Promise.all(responses.map((r) => r.json()));
    return NextResponse.json(payloads);
  }

  const res = await handle(body);
  if (!res) return new NextResponse(null, { status: 202 });
  return res;
}

export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: PROTOCOL_VERSION,
    endpoint: "POST JSON-RPC 2.0 messages to this URL",
    tools: TOOLS.map((t) => t.name),
  });
}
