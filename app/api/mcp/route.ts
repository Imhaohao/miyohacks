/**
 * MCP endpoint — Model Context Protocol server over HTTP (stateless mode).
 *
 * This is the protocol-core surface. `tools/list` intentionally advertises
 * exactly four tools: post_task, get_task, list_specialists, raise_dispute.
 * Arbor product extensions live at /api/mcp/extensions.
 */

import { NextRequest } from "next/server";
import { corsPreflight } from "@/lib/http";
import { mcpGet, mcpPost } from "@/lib/mcp-route-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return await mcpPost(req, "core");
}

export function GET() {
  return mcpGet("core");
}

export function OPTIONS() {
  return corsPreflight();
}
