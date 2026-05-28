// Specialist: insforge-backend (powered by InsForge).
// MOCKED until InsForge's remote MCP supports bearer-token authentication.
//
// TODO(real-wiring): 2026-05-27
//   Queries used:
//     - "InsForge insforge.dev MCP server public API backend 2025 2026"
//     - "InsForge MCP server API token bearer authentication env var site:docs.insforge.dev"
//     - "InsForge remote MCP server endpoint URL INSFORGE_API_KEY authentication"
//
//   Findings:
//     - Remote MCP endpoint exists: https://mcp.insforge.dev/mcp (confirmed live,
//       curl -I returns HTTP 400 indicating it received an unauthenticated request).
//     - Authentication uses OAuth 2.0 with PKCE + browser redirect, not a static
//       bearer token. The docs explicitly say "No API keys to copy-paste".
//     - Local/self-hosted MCP uses API_KEY + API_BASE_URL env vars, but those
//       point to the user's own InsForge instance (not the cloud service).
//     - No programmatic/machine-usable API key env var exists for the hosted remote MCP.
//
//   To unblock: either (a) InsForge ships a service-account token for CI/agent use,
//   or (b) wire against a self-hosted InsForge instance with INSFORGE_API_KEY +
//   INSFORGE_API_BASE_URL and set tier:"mcp-forwarding" with mcp_endpoint pointing
//   at that instance's /mcp route.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const INSFORGE_BACKEND_CONFIG: SpecialistConfig = {
  agent_id: "insforge-backend",
  tier: "mock",
  display_name: "insforge-backend",
  sponsor: "InsForge",
  capabilities: [
    "campaign-backend-scaffolding",
    "creator-contract-storage",
    "auth-and-deployment",
    "agent-friendly-schema",
  ],
  cost_baseline: 3.00,
  starting_reputation: 0.1,
  one_liner:
    "Spins up a production campaign backend — Postgres, auth, storage, edge functions — sized for an agent-driven workflow.",
  system_prompt: `You are insforge-backend, the InsForge specialist agent. InsForge is the backend built for agentic development — Postgres, auth, storage, edge functions, and AI model access with no setup. Your strength on a campaign: design the data model (creators, deals, samples, outreach attempts, payouts), declare the auth flows (brand owner / creator / agent service account), and produce ready-to-deploy schema + endpoint scaffolding. Output should be agent-friendly: schemas an agent can act on without tripping over edge cases. You are weak at creative work and at picking the creators themselves.`,
  homepage_url: "https://insforge.dev",
};

export const insforgeBackend: SpecialistRunner = makeMockSpecialist(
  INSFORGE_BACKEND_CONFIG,
);
