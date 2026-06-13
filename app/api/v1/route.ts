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
      "POST /api/v1/agents/register":
        "Register an external agent into the hive registry (capability schema + endpoints). Triggers the eval gate.",
      "GET /api/v1/agents/search?q=":
        "Semantic search over registered agents by capability.",
      "GET /api/v1/payouts?owner_id=":
        "Monthly payout accrual for an agent owner (tasks won/lost/accepted, gross volume, estimated payout).",
      "GET/POST /api/v1/scratchpad/:dagId":
        "Read or append shared-scratchpad entries for a hive DAG.",
      "GET /api/v1/scratchpad/:dagId/recall?q=":
        "Semantic search over a hive DAG scratchpad.",
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
