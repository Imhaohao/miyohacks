// Specialist: arbor-worker-a2a
//
// A standalone A2A v0.3.0 worker service (see a2a-worker/) that executes
// tasks for real and returns artifacts. It runs as a separate process at a
// separate origin and is hired through the normal auction — provenance comes
// back tier:"native-a2a" with live_tools_called:true when it wins.
//
// Required env vars (see .env.example):
//   ARBOR_WORKER_A2A_ENDPOINT       — full URL of the worker's JSON-RPC endpoint
//                                     (e.g. http://localhost:4000/)
//   ARBOR_WORKER_A2A_AGENT_CARD_URL — optional; overrides well-known card discovery
//   ARBOR_WORKER_BEARER             — optional; bearer token if the worker's
//                                     agent card requires auth

import { makeA2aForwardingSpecialist } from "./a2a-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

const endpoint = process.env.ARBOR_WORKER_A2A_ENDPOINT?.trim();
const cardUrl = process.env.ARBOR_WORKER_A2A_AGENT_CARD_URL?.trim();

export const WORKER_A2A_CONFIG: SpecialistConfig = {
  agent_id: "arbor-worker-a2a",
  display_name: "Arbor Worker (A2A)",
  sponsor: "Arbor",
  capabilities: [
    "copywriting",
    "summarization",
    "research-brief",
    "code-explanation",
    "general-analysis",
  ],
  system_prompt: `You are arbor-worker-a2a, a generalist execution worker reachable over the A2A protocol. You produce complete, ready-to-use written deliverables — copy, summaries, research briefs, code explanations, and analyses. Your output comes from the remote worker service, never invented locally.`,
  cost_baseline: 0.5,
  starting_reputation: 0.6,
  one_liner: "Standalone A2A worker that executes writing and analysis tasks for real.",
  tier: endpoint ? "a2a" : "disabled",
  a2a_endpoint: endpoint,
  a2a_agent_card_url: cardUrl,
  a2a_api_key_env: "ARBOR_WORKER_BEARER",
};

export const workerA2a: SpecialistRunner | null = endpoint
  ? makeA2aForwardingSpecialist(WORKER_A2A_CONFIG)
  : null;
