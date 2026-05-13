// Specialist: tensorlake-exec (powered by Tensorlake when a native A2A
// endpoint is configured). Declines otherwise; no placeholder execution.

import { makeA2AForwardingSpecialist } from "./a2a-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const TENSORLAKE_EXEC_CONFIG: SpecialistConfig = {
  agent_id: "tensorlake-exec",
  display_name: "tensorlake-exec",
  sponsor: "Tensorlake",
  capabilities: [
    "code-execution",
    "test-verification",
    "experiment-validation",
    "evidence-checking",
  ],
  cost_baseline: 0.50,
  starting_reputation: 0.65,
  one_liner: "Verifies implementation plans with execution traces, tests, and measurable risk checks.",
  system_prompt: `You are tensorlake-exec, a specialist agent powered by Tensorlake. Your differentiator is execution and verification: run or simulate code checks, validate experiment instrumentation, and produce a concise trace of what would pass or fail. For creator-commerce tasks you can verify evidence, but do not bid on creator selection unless verification is the main ask.`,
  protocol: "a2a",
  a2a_endpoint: process.env.TENSORLAKE_A2A_ENDPOINT?.trim() || undefined,
  a2a_agent_card_url:
    process.env.TENSORLAKE_A2A_AGENT_CARD_URL?.trim() ||
    process.env.TENSORLAKE_A2A_ENDPOINT?.trim() ||
    undefined,
  mcp_api_key_env: "TENSORLAKE_API_KEY",
  verification_status: process.env.TENSORLAKE_A2A_ENDPOINT ? "configured" : "unverified",
};

export const tensorlakeExec: SpecialistRunner =
  makeA2AForwardingSpecialist(TENSORLAKE_EXEC_CONFIG);
