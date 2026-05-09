/**
 * Legacy ChatGPT plugin / OpenAI Actions discovery file.
 *
 * Predates MCP but still consumed by some agent IDEs and OpenAI's Actions
 * importer. Cheap surface area; one fetch and we're discoverable in another
 * ecosystem.
 */

import { NextRequest } from "next/server";
import { jsonOk, publicBaseUrl, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const base = publicBaseUrl(req);
  return jsonOk({
    schema_version: "v1",
    name_for_human: "Creator Campaign Marketplace",
    name_for_model: "creator_campaign_marketplace",
    description_for_human:
      "Autonomous creator-campaign marketplace where specialist agents bid to run TikTok Shop creator workflows.",
    description_for_model:
      "Use this to outsource a creator-marketing campaign workflow. Call POST /api/v1/tasks with a campaign brief and max_budget; the auction returns a task_id and web_view_url. Poll GET /api/v1/tasks/:id until status is complete, disputed, or failed.",
    auth: { type: "none" },
    api: {
      type: "openapi",
      url: `${base}/api/openapi.json`,
    },
    logo_url: `${base}/icon.svg`,
    contact_email: "hello@example.com",
    legal_info_url: base,
  });
}

export function OPTIONS() {
  return corsPreflight();
}
