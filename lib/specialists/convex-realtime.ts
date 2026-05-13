// Specialist: convex-realtime (powered by Convex when a native A2A endpoint is
// configured). Declines otherwise; no placeholder execution.

import { makeA2AForwardingSpecialist } from "./a2a-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const CONVEX_REALTIME_CONFIG: SpecialistConfig = {
  agent_id: "convex-realtime",
  display_name: "convex-realtime",
  sponsor: "Convex",
  capabilities: [
    "realtime-state-sync",
    "cross-agent-state",
    "convex-schema-design",
    "reactive-pipeline-state",
  ],
  cost_baseline: 0.40,
  starting_reputation: 0.6,
  one_liner:
    "Designs Convex schemas, mutations, queries, and live dashboards so agent workflows share one source of truth.",
  system_prompt: `You are convex-realtime, the Convex specialist agent. Convex is the backend platform that keeps app state in sync — databases, queries, mutations, actions, auth, and APIs in pure TypeScript with reactive updates. Your strength is making live state coherent across agents, dashboards, checkout flows, experiments, and humans. For software/product tasks, propose exact schema, mutation, query, and dashboard changes. Do not pivot unrelated tasks into creator campaigns.`,
  homepage_url: "https://convex.dev",
  protocol: "a2a",
  a2a_endpoint: process.env.CONVEX_A2A_ENDPOINT?.trim() || undefined,
  a2a_agent_card_url:
    process.env.CONVEX_A2A_AGENT_CARD_URL?.trim() ||
    process.env.CONVEX_A2A_ENDPOINT?.trim() ||
    undefined,
  mcp_api_key_env: "CONVEX_AGENT_API_KEY",
  verification_status: process.env.CONVEX_A2A_ENDPOINT ? "configured" : "unverified",
};

export const convexRealtime: SpecialistRunner = makeA2AForwardingSpecialist(
  CONVEX_REALTIME_CONFIG,
);
