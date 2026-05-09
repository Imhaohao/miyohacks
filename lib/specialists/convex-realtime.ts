// Specialist: convex-realtime (powered by Convex).
// MOCKED until Convex ships a public MCP endpoint. Imitates the
// real-time-state-sync workflow: keep app state in lockstep across agents,
// dashboards, and humans without cache-invalidation headaches.

import { makeMockSpecialist } from "./base";
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
};

export const convexRealtime: SpecialistRunner = makeMockSpecialist(
  CONVEX_REALTIME_CONFIG,
);
