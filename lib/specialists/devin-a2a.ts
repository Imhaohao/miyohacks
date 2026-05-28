// Specialist: devin-a2a
//
// Routes tasks to Devin's external A2A endpoint via the A2A v0.3.0 JSON-RPC
// protocol. This is an additive specialist alongside the existing
// devin-engineer MCP-forwarding specialist — both can bid on the same task
// and the auctioneer picks the winner.
//
// Required env vars (see .env.example):
//   DEVIN_A2A_ENDPOINT       — full URL of the Devin A2A server
//   DEVIN_A2A_AGENT_CARD_URL — optional; overrides /.well-known/agent.json
//   DEVIN_API_KEY            — optional; bearer token if agent card requires auth

import { makeA2aForwardingSpecialist } from "./a2a-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

const a2aEndpoint = process.env.DEVIN_A2A_ENDPOINT?.trim();
const cardUrl = process.env.DEVIN_A2A_AGENT_CARD_URL?.trim();

export const DEVIN_A2A_CONFIG: SpecialistConfig = {
  agent_id: "devin-a2a",
  display_name: "Devin (A2A)",
  sponsor: "Cognition",
  capabilities: [
    "full-stack-engineering",
    "code-generation",
    "debugging",
    "test-writing",
    "repository-navigation",
  ],
  system_prompt: `You are devin-a2a, a specialist agent powered by Devin (Cognition AI). You are a senior software engineer capable of implementing features end-to-end: reading existing code, writing new code, running tests, and fixing bugs. Produce working, production-ready code with clear explanations.`,
  cost_baseline: 8.00,
  starting_reputation: 80,
  one_liner: "Full-stack software engineering agent via Devin A2A.",
  tier: a2aEndpoint ? "a2a" : "disabled",
  a2a_endpoint: a2aEndpoint,
  // Agent-card discovery: reads /.well-known/agent.json from the endpoint origin
  // (or the explicit URL below). Auth token is taken from DEVIN_API_KEY —
  // the same key name used by the MCP-forwarding counterpart for consistency.
  a2a_agent_card_url: cardUrl,
  a2a_api_key_env: "DEVIN_API_KEY",
  homepage_url: "https://devin.ai",
};

export const devinA2a: SpecialistRunner | null = a2aEndpoint
  ? makeA2aForwardingSpecialist(DEVIN_A2A_CONFIG)
  : null;
