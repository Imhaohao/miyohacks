import { NextRequest, NextResponse } from "next/server";
import type { ApiCallerIdentity } from "@/lib/api-identity";
import { resolveApiIdentity } from "@/lib/api-identity";
import { CORS_HEADERS } from "@/lib/http";
import {
  dispatchMcpSurfaceTool,
  getMcpSurfaceTools,
  type McpToolSurface,
} from "@/lib/mcp-tools";

const PROTOCOL_VERSION = "2024-11-05";

export type McpSurface = McpToolSurface;

const SURFACES: Record<
  McpSurface,
  {
    serverInfo: {
      name: string;
      version: string;
      description: string;
    };
    endpoint: string;
  }
> = {
  core: {
    serverInfo: {
      name: "arbor",
      version: "0.1.0",
      description:
        "Arbor is an MCP-first agent auction protocol for task posting, task state, specialist discovery, and dispute resolution.",
    },
    endpoint: "/api/mcp",
  },
  extensions: {
    serverInfo: {
      name: "arbor-extensions",
      version: "0.1.0",
      description:
        "Optional Arbor product extensions for billing, checkout, product context, contacts, plan approval, and admin operations.",
    },
    endpoint: "/api/mcp/extensions",
  },
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

function publicToolShape(tool: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function publicToolsFor(surface: McpSurface) {
  return getMcpSurfaceTools(surface).map(publicToolShape);
}

async function handle(
  surface: McpSurface,
  msg: JsonRpcRequest,
  identity?: ApiCallerIdentity | null,
): Promise<JsonRpcEnvelope | null> {
  const { id, method, params } = msg;
  const config = SURFACES[surface];

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: config.serverInfo,
        capabilities: { tools: {} },
      });

    case "notifications/initialized":
      return null;

    case "tools/list":
      return ok(id, { tools: publicToolsFor(surface) });

    case "tools/call": {
      const name = params?.name as string | undefined;
      const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
      if (!name) return err(id, -32602, "missing tool name");
      try {
        const result = await dispatchMcpSurfaceTool(surface, name, args, identity, {
          allowLegacyExtensionsOnCore: true,
        });
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

export async function mcpPost(req: NextRequest, surface: McpSurface) {
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
    for (const r of await Promise.all(body.map((msg) => handle(surface, msg, identity)))) {
      if (r) responses.push(r);
    }
    if (responses.length === 0) {
      return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
    }
    return jsonRpc(responses);
  }

  const res = await handle(surface, body, identity);
  if (!res) return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
  return jsonRpc(res);
}

export function mcpGet(surface: McpSurface) {
  const config = SURFACES[surface];
  return NextResponse.json(
    {
      ...config.serverInfo,
      protocol: PROTOCOL_VERSION,
      transport: "streamable-http (stateless)",
      endpoint: `POST JSON-RPC 2.0 messages to ${config.endpoint}`,
      surface,
      tools: publicToolsFor(surface).map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
      core_endpoint: "/api/mcp",
      extensions_endpoint: "/api/mcp/extensions",
      docs: "/api/openapi.json",
      compatibility:
        surface === "core"
          ? "Legacy bare extension tool calls still work on /api/mcp, but tools/list advertises only the four protocol tools."
          : "Extension tools are namespaced by category, for example billing.get_wallet.",
    },
    { headers: CORS_HEADERS },
  );
}
