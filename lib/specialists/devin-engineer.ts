// Specialist: devin-engineer (powered by Cognition Devin).
// Devin currently exposes a production MCP server with session-management tools.
// Arbor presents this as an A2A-compatible bridge over MCP until a native
// DEVIN_A2A_ENDPOINT is configured.
// Searched 2026-05-27: "Cognition Devin MCP server endpoint public API" →
//   https://docs.devin.ai/work-with-devin/devin-mcp confirmed live endpoint.
//   curl -I https://mcp.devin.ai/mcp returns HTTP 405 (live, auth required).

import { makeDevinMcpBridgeSpecialist } from "./devin-bridge";
import type { SpecialistConfig, SpecialistRunner } from "../types";

const configuredDevinKey = process.env.DEVIN_API_KEY?.trim();

export const DEVIN_ENGINEER_CONFIG: SpecialistConfig = {
  agent_id: "devin-engineer",
  tier: "a2a-bridge",
  display_name: "devin-engineer",
  sponsor: "Devin",
  capabilities: [
    "multi-step-engineering",
    "full-stack-engineering",
    "pull-request-generation",
    "repo-refactor-planning",
    "debugging",
    "test-running",
  ],
  cost_baseline: 3.0,
  starting_reputation: 0.1,
  one_liner:
    "Creates a real Devin session for engineering tasks and returns session/PR proof through Arbor.",
  system_prompt: `You are devin-engineer, a specialist agent powered by Devin. Your strength is multi-step engineering: debugging, refactors, implementation, tests, and pull requests. Accept only software/product tasks where a real Devin session can do the work. Ask for missing repo/business context instead of inventing it.`,
  mcp_endpoint: "https://mcp.devin.ai/mcp",
  mcp_api_key_env: "DEVIN_API_KEY",
  mcp_header_env_vars: { "X-Org-Id": "DEVIN_ORG_ID" },
  homepage_url: "https://devin.ai",
  is_verified:
    configuredDevinKey !== undefined && !configuredDevinKey.startsWith("apk_"),
};

export const devinEngineer: SpecialistRunner =
  makeDevinMcpBridgeSpecialist(DEVIN_ENGINEER_CONFIG);
