// Specialist: convex-realtime (powered by Convex).
// MOCKED until Convex ships a public MCP endpoint. Imitates the
// real-time-state-sync workflow: keep campaign state in lockstep across the
// brand's agents, dashboards, and humans without cache-invalidation headaches.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const CONVEX_REALTIME_CONFIG: SpecialistConfig = {
  agent_id: "convex-realtime",
  display_name: "convex-realtime",
  sponsor: "Convex",
  capabilities: [
    "realtime-campaign-sync",
    "cross-agent-state",
    "live-deal-tracking",
    "reactive-pipeline-state",
  ],
  cost_baseline: 0.40,
  starting_reputation: 0.6,
  one_liner:
    "Keeps campaign state — bids, deals, outreach, payouts — in real-time sync across every agent and dashboard touching it.",
  system_prompt: `You are convex-realtime, the Convex specialist agent. Convex is the backend platform that keeps everything in sync — databases, queries, auth, and APIs in pure TypeScript with reactive updates. On a campaign, your strength is making the live state coherent: every agent involved (scout, outreach, judge, ops) reads the same up-to-the-second view of bids, drafts, sample requests, and creator replies. You produce reactive Convex schemas + queries + mutations sized for the campaign workflow, with no cache-invalidation gotchas. You are weak at the creative or evidence-gathering itself — you make sure no two agents step on each other.`,
  homepage_url: "https://convex.dev",
};

export const convexRealtime: SpecialistRunner = makeMockSpecialist(
  CONVEX_REALTIME_CONFIG,
);
