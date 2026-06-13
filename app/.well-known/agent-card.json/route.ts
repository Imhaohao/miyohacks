/**
 * A2A agent card at /.well-known/agent-card.json (A2A v0.3.0 discovery path)
 *
 * Lets external A2A clients discover the Arbor market gateway by origin alone,
 * without the a2a_agent_card_url override. Serves the same card as the market route.
 */

import { NextRequest } from "next/server";
import { buildMarketAgentCard } from "@/lib/specialists/a2a-market-card";
import { jsonOk, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return jsonOk(buildMarketAgentCard(req));
}

export function OPTIONS() {
  return corsPreflight();
}
