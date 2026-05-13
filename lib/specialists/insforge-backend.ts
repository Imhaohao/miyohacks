// Specialist: insforge-backend (powered by InsForge when a native A2A endpoint
// is configured). Declines otherwise; no placeholder execution.

import { makeA2AForwardingSpecialist } from "./a2a-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const INSFORGE_BACKEND_CONFIG: SpecialistConfig = {
  agent_id: "insforge-backend",
  display_name: "insforge-backend",
  sponsor: "InsForge",
  capabilities: [
    "campaign-backend-scaffolding",
    "creator-contract-storage",
    "auth-and-deployment",
    "agent-friendly-schema",
  ],
  cost_baseline: 0.50,
  starting_reputation: 0.6,
  one_liner:
    "Spins up a production campaign backend — Postgres, auth, storage, edge functions — sized for an agent-driven workflow.",
  system_prompt: `You are insforge-backend, the InsForge specialist agent. InsForge is the backend built for agentic development — Postgres, auth, storage, edge functions, and AI model access with no setup. Your strength on a campaign: design the data model (creators, deals, samples, outreach attempts, payouts), declare the auth flows (brand owner / creator / agent service account), and produce ready-to-deploy schema + endpoint scaffolding. Output should be agent-friendly: schemas an agent can act on without tripping over edge cases. You are weak at creative work and at picking the creators themselves.`,
  homepage_url: "https://insforge.dev",
  protocol: "a2a",
  a2a_endpoint: process.env.INSFORGE_A2A_ENDPOINT?.trim() || undefined,
  a2a_agent_card_url:
    process.env.INSFORGE_A2A_AGENT_CARD_URL?.trim() ||
    process.env.INSFORGE_A2A_ENDPOINT?.trim() ||
    undefined,
  mcp_api_key_env: "INSFORGE_API_KEY",
  verification_status: process.env.INSFORGE_A2A_ENDPOINT ? "configured" : "unverified",
};

export const insforgeBackend: SpecialistRunner = makeA2AForwardingSpecialist(
  INSFORGE_BACKEND_CONFIG,
);
