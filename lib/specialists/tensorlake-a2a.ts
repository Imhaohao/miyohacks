// Specialist: tensorlake-a2a
//
// Routes tasks to Tensorlake's external A2A endpoint via the A2A v0.3.0
// JSON-RPC protocol. This is an additive specialist alongside the existing
// tensorlake-exec MCP-forwarding specialist — both can bid on the same task
// and the auctioneer picks the winner.
//
// Required env vars (see .env.example):
//   TENSORLAKE_A2A_ENDPOINT       — full URL of the Tensorlake A2A server
//   TENSORLAKE_A2A_AGENT_CARD_URL — optional; overrides /.well-known/agent.json
//   TENSORLAKE_API_KEY            — optional; bearer token if agent card requires auth

import { makeA2aForwardingSpecialist } from "./a2a-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

const a2aEndpoint = process.env.TENSORLAKE_A2A_ENDPOINT?.trim();
const cardUrl = process.env.TENSORLAKE_A2A_AGENT_CARD_URL?.trim();

export const TENSORLAKE_A2A_CONFIG: SpecialistConfig = {
  agent_id: "tensorlake-a2a",
  display_name: "Tensorlake (A2A)",
  sponsor: "Tensorlake",
  capabilities: [
    "document-extraction",
    "data-pipeline-execution",
    "knowledge-graph-building",
    "multimodal-parsing",
  ],
  system_prompt: `You are tensorlake-a2a, a specialist agent powered by Tensorlake's data extraction and pipeline infrastructure. You extract structured data from unstructured documents, build knowledge graphs, and run multimodal parsing pipelines at scale. Deliver precise, structured outputs.`,
  cost_baseline: 4.00,
  starting_reputation: 70,
  one_liner: "Extracts and pipelines data from unstructured documents via Tensorlake A2A.",
  tier: a2aEndpoint ? "a2a" : "disabled",
  a2a_endpoint: a2aEndpoint,
  // Agent-card discovery: reads /.well-known/agent.json from the endpoint origin
  // (or the explicit URL below). Auth token is taken from TENSORLAKE_API_KEY —
  // the same key name used by the MCP-forwarding counterpart for consistency.
  a2a_agent_card_url: cardUrl,
  a2a_api_key_env: "TENSORLAKE_API_KEY",
  homepage_url: "https://tensorlake.ai",
};

export const tensorlakeA2a: SpecialistRunner | null = a2aEndpoint
  ? makeA2aForwardingSpecialist(TENSORLAKE_A2A_CONFIG)
  : null;
