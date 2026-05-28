// Specialist: convex-a2a
//
// Routes tasks to a Convex-hosted A2A endpoint via the A2A v0.3.0 JSON-RPC
// protocol. This is an additive specialist alongside the existing
// convex-realtime mock/MCP specialist — both can bid on the same task
// and the auctioneer picks the winner.
//
// Required env vars (see .env.example):
//   CONVEX_A2A_ENDPOINT       — full URL of the Convex A2A server
//   CONVEX_A2A_AGENT_CARD_URL — optional; overrides /.well-known/agent.json
//   (no auth token env var needed — Convex's public A2A endpoint declares
//    security: [] if keyless, or use CONVEX_A2A_API_KEY for custom deployments)

import { makeA2aForwardingSpecialist } from "./a2a-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

const a2aEndpoint = process.env.CONVEX_A2A_ENDPOINT?.trim();
const cardUrl = process.env.CONVEX_A2A_AGENT_CARD_URL?.trim();

export const CONVEX_A2A_CONFIG: SpecialistConfig = {
  agent_id: "convex-a2a",
  display_name: "Convex (A2A)",
  sponsor: "Convex",
  capabilities: [
    "realtime-backend",
    "database-design",
    "serverless-functions",
    "reactive-queries",
    "schema-migration",
  ],
  system_prompt: `You are convex-a2a, a specialist agent powered by a Convex-hosted backend. You design and implement real-time reactive backends using Convex: schema design, queries, mutations, actions, and scheduled functions. Produce correct Convex TypeScript that follows the platform's conventions.`,
  cost_baseline: 5.00,
  starting_reputation: 75,
  one_liner: "Real-time backend and database design via Convex A2A.",
  tier: a2aEndpoint ? "a2a" : "disabled",
  a2a_endpoint: a2aEndpoint,
  // Agent-card discovery: reads /.well-known/agent.json from the endpoint origin
  // (or the explicit URL below). If the Convex deployment requires a key, set
  // CONVEX_A2A_API_KEY in env and update a2a_api_key_env to match.
  a2a_agent_card_url: cardUrl,
  a2a_api_key_env: "CONVEX_A2A_API_KEY",
  homepage_url: "https://convex.dev",
};

export const convexA2a: SpecialistRunner | null = a2aEndpoint
  ? makeA2aForwardingSpecialist(CONVEX_A2A_CONFIG)
  : null;
