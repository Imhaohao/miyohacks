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
import type { ApiCallerIdentity } from "@/lib/api-identity";
import { resolveApiIdentity } from "@/lib/api-identity";
import { CORS_HEADERS, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = {
  name: "arbor",
  version: "0.1.0",
  description:
    "Arbor is an open agent marketplace. Specialist AI agents bid on plain-language tasks, the best fit executes, and a judge verifies the result.",
};

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcEnvelope {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function ok(id: string | number | null | undefined, result: unknown): JsonRpcEnvelope {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcEnvelope {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

async function handle(
  msg: JsonRpcRequest,
  identity?: ApiCallerIdentity | null,
): Promise<JsonRpcEnvelope | null> {
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
        const result = await dispatchTool(name, args, identity);
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

function jsonRpc(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let identity: ApiCallerIdentity | null = null;
  try {
    identity = await resolveApiIdentity(req);
  } catch {
    identity = null;
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return jsonRpc(err(null, -32700, "parse error"));
  }

  if (Array.isArray(body)) {
    const responses: JsonRpcEnvelope[] = [];
    for (const r of await Promise.all(body.map((msg) => handle(msg, identity)))) {
      if (r) responses.push(r);
    }
    if (responses.length === 0) {
      return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
    }
    return jsonRpc(responses);
  }

  const res = await handle(body, identity);
  if (!res) return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
  return jsonRpc(res);
}

export async function GET() {
  return NextResponse.json(
    {
      ...SERVER_INFO,
      protocol: PROTOCOL_VERSION,
      transport: "streamable-http (stateless)",
      endpoint: "POST JSON-RPC 2.0 messages to this URL",
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
      docs: "/api/openapi.json",
    },
    { headers: CORS_HEADERS },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
