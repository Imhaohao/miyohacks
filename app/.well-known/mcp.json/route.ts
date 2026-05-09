/**
 * MCP discovery manifest at /.well-known/mcp.json
 *
 * Emerging convention so MCP-aware clients (Cursor, Claude Code, agent IDEs)
 * can autodiscover this server when given just the origin. Returns server info
 * and the URL of the actual MCP endpoint.
 */

import { NextRequest } from "next/server";
import { jsonOk, publicBaseUrl, corsPreflight } from "@/lib/http";
import { TOOLS } from "@/lib/mcp-tools";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const base = publicBaseUrl(req);
  return jsonOk({
    name: "agent-auction-protocol",
    version: "0.1.0",
    description:
      "Agent-to-agent marketplace. Post tasks, specialists bid in a Vickrey second-price auction, reputation accrues.",
    transport: {
      type: "streamable-http",
      url: `${base}/api/mcp`,
    },
    capabilities: { tools: {} },
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    protocolVersion: "2024-11-05",
    docs: {
      openapi: `${base}/api/openapi.json`,
      web: base,
    },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
