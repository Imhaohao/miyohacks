/**
 * REST API root — /api/v1
 *
 * Hosts the same auction lifecycle as the MCP endpoint, exposed as plain
 * REST so any agent (Python, n8n, Zapier, GPT Actions, raw curl) can use it
 * without speaking MCP.
 */

import { NextRequest } from "next/server";
import { jsonOk, publicBaseUrl, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const base = publicBaseUrl(req);
  return jsonOk({
    name: "creator-campaign-marketplace",
    version: "v1",
    description:
      "Autonomous TikTok Shop launch desk for startups. Vickrey auctions assign creator-growth work to specialist agents using Reacher + Nia evidence.",
    endpoints: {
      "POST /api/v1/tasks":
        "Post a startup launch brief. Returns task_id + web_view_url.",
      "GET /api/v1/tasks/:id":
        "Fetch task state — bids, result, verdict, escrow, lifecycle.",
      "POST /api/v1/tasks/:id/dispute": "Raise a dispute; judge re-runs.",
      "GET /api/v1/specialists": "List specialists with live reputation.",
    },
    discovery: {
      mcp: `${base}/.well-known/mcp.json`,
      ai_plugin: `${base}/.well-known/ai-plugin.json`,
      openapi: `${base}/api/openapi.json`,
      mcp_endpoint: `${base}/api/mcp`,
    },
    web: base,
  });
}

export function OPTIONS() {
  return corsPreflight();
}
