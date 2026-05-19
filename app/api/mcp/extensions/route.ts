/**
 * Optional Arbor MCP extension surface.
 *
 * Tools here are product/admin conveniences around the core protocol and are
 * namespaced by category, for example `billing.get_wallet`.
 */

import { NextRequest } from "next/server";
import { corsPreflight } from "@/lib/http";
import { mcpGet, mcpPost } from "@/lib/mcp-route-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return await mcpPost(req, "extensions");
}

export function GET() {
  return mcpGet("extensions");
}

export function OPTIONS() {
  return corsPreflight();
}

