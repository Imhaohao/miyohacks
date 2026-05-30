// Specialist: insforge-backend (powered by InsForge).
//
// WIRED 2026-05-29 — InsForge's hosted MCP now accepts a static API key.
// The live endpoint's auth error states:
//   "Provide Authorization: Bearer <OAUTH_TOKEN> or X-Api-Key header."
// (verified 2026-05-29 against https://mcp.insforge.dev/mcp). This is the
// service-account/CI token path the earlier research said would unblock real
// wiring — so we no longer need the OAuth 2.0 + PKCE browser flow.
//
// Wiring:
//   - tier: "mcp-forwarding" — generic LLM-driven tool-calling loop over the
//     remote MCP, same as nia-context / hyperspell-brain.
//   - Auth (legacy/project-scoped): TWO headers are required, confirmed live —
//       X-Api-Key:  <INSFORGE_API_KEY>      (project API key from the dashboard)
//       X-Base-URL: <INSFORGE_API_BASE_URL> (that project's base URL)
//     Sending X-Api-Key alone returns:
//       "Missing X-Base-URL header (required for legacy authentication)."
//   - mcp_requires_session: true — InsForge enforces the Streamable-HTTP
//     session handshake ("Session required. Send initialize request first or
//     provide valid Mcp-Session-Id header."), so the client must capture and
//     echo Mcp-Session-Id. Without a key, the probe declines loudly and the
//     agent drops to the demo lane — no silent mock.
//
// Auth server metadata (for reference, if we ever switch to OAuth):
//   authorization_endpoint: https://mcp.insforge.dev/oauth/authorize
//   token_endpoint:         https://mcp.insforge.dev/oauth/token
//   scopes_supported:       mcp:read, mcp:write, project:select

import { makeMcpForwardingSpecialist } from "./mcp-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const INSFORGE_BACKEND_CONFIG: SpecialistConfig = {
  agent_id: "insforge-backend",
  tier: "mcp-forwarding",
  display_name: "insforge-backend",
  sponsor: "InsForge",
  capabilities: [
    "campaign-backend-scaffolding",
    "creator-contract-storage",
    "auth-and-deployment",
    "agent-friendly-schema",
  ],
  cost_baseline: 3.0,
  starting_reputation: 0.1,
  one_liner:
    "Spins up a production campaign backend — Postgres, auth, storage, edge functions — sized for an agent-driven workflow.",
  system_prompt: `You are insforge-backend, the InsForge specialist agent. InsForge is the backend built for agentic development — Postgres, auth, storage, edge functions, and AI model access with no setup. Your strength on a campaign: design the data model (creators, deals, samples, outreach attempts, payouts), declare the auth flows (brand owner / creator / agent service account), and produce ready-to-deploy schema + endpoint scaffolding. Use the InsForge MCP tools to ground every claim in real backend operations. Output should be agent-friendly: schemas an agent can act on without tripping over edge cases. You are weak at creative work and at picking the creators themselves.`,
  homepage_url: "https://insforge.dev",
  mcp_endpoint: "https://mcp.insforge.dev/mcp",
  mcp_header_env_vars: {
    "X-Api-Key": "INSFORGE_API_KEY",
    "X-Base-URL": "INSFORGE_API_BASE_URL",
  },
  mcp_requires_session: true,
};

export const insforgeBackend: SpecialistRunner = makeMcpForwardingSpecialist(
  INSFORGE_BACKEND_CONFIG,
);
