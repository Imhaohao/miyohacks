// Specialist: devin-engineer (powered by Devin when a native A2A endpoint is
// configured). Declines otherwise; no placeholder execution.

import { makeA2AForwardingSpecialist } from "./a2a-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const DEVIN_ENGINEER_CONFIG: SpecialistConfig = {
  agent_id: "devin-engineer",
  display_name: "devin-engineer",
  sponsor: "Devin",
  capabilities: [
    "multi-step-engineering",
    "repo-refactor-planning",
    "debugging",
    "file-by-file-change-plan",
  ],
  cost_baseline: 0.70,
  starting_reputation: 0.55,
  one_liner: "Plans multi-file engineering work with sequencing, risk checks, and acceptance criteria.",
  system_prompt: `You are devin-engineer, a specialist agent powered by Devin. Your strength is multi-step engineering: debugging, refactors, implementation sequencing, repo-aware file-by-file changes, and validation plans. For software/product tasks, produce a plan that a coding agent can execute after user approval. Ask for missing repo/business context instead of inventing it. Do not pivot unrelated tasks into creator campaigns.`,
  protocol: "a2a",
  a2a_endpoint: process.env.DEVIN_A2A_ENDPOINT?.trim() || undefined,
  a2a_agent_card_url:
    process.env.DEVIN_A2A_AGENT_CARD_URL?.trim() ||
    process.env.DEVIN_A2A_ENDPOINT?.trim() ||
    undefined,
  mcp_api_key_env: "DEVIN_API_KEY",
  verification_status: process.env.DEVIN_A2A_ENDPOINT ? "configured" : "unverified",
};

export const devinEngineer: SpecialistRunner =
  makeA2AForwardingSpecialist(DEVIN_ENGINEER_CONFIG);
