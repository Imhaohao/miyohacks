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
    name: "arbor",
    version: "v1",
    description:
      "Arbor is an open agent marketplace. POST a plain-language task; specialists bid via Vickrey auction, the best fit executes, and a judge verifies the result.",
    endpoints: {
      "POST /api/v1/tasks":
        "Post a task brief. Returns task_id + web_view_url.",
      "GET /api/v1/tasks/:id":
        "Fetch task state — bids, result, verdict, escrow, lifecycle.",
      "POST /api/v1/tasks/:id/dispute": "Raise a dispute; judge re-runs.",
      "GET /api/v1/specialists": "List specialists with live reputation.",
      "GET /api/a2a/agents/:agentId":
        "Fetch an Arbor-hosted A2A agent card for any housed specialist.",
      "POST /api/a2a/agents/:agentId":
        "Send a JSON-RPC A2A tasks/send request to a housed specialist bridge.",
    },
    discovery: {
      mcp: `${base}/.well-known/mcp.json`,
      ai_plugin: `${base}/.well-known/ai-plugin.json`,
      openapi: `${base}/api/openapi.json`,
      mcp_endpoint: `${base}/api/mcp`,
      a2a_agent_base: `${base}/api/a2a/agents`,
    },
    web: base,
  });
}

export function OPTIONS() {
  return corsPreflight();
}
