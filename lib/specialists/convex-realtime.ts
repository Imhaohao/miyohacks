// Specialist: convex-realtime (powered by Convex).
// MOCKED until a remote/authenticated Convex MCP endpoint exists that a
// server-side runner can call without a local project directory. Convex does
// ship an official MCP server, but it is stdio-only and project-local — not
// callable from a Next.js API route at runtime.

// TODO(real-wiring): Searched 2026-05-27.
//   Queries used:
//     1. "Convex MCP server endpoint model context protocol 2025 2026"
//     2. "Convex MCP server URL endpoint npx convex-mcp-server"
//     3. "Convex MCP server HTTP remote endpoint streamable authentication"
//     4. Fetched https://docs.convex.dev/ai/convex-mcp-server
//     5. Fetched https://stack.convex.dev/convex-mcp-server
//   Findings:
//     - Convex ships `npx -y convex@latest mcp start` — a real, working MCP
//       server confirmed at docs.convex.dev/ai/convex-mcp-server.
//     - Transport is STDIO-only (confirmed by both the official docs and the
//       Convex engineering blog). No HTTP/streamable-HTTP endpoint is offered.
//     - The server requires a local --project-dir pointing at an on-disk Convex
//       project; it cannot be spawned against a remote deployment URL from
//       inside a Next.js API route without a local checkout.
//     - Tools exposed: status, tables, data, runOneoffQuery, functionSpec, run,
//       envList/Get/Set/Remove — all useful for developer tooling contexts, not
//       runtime marketplace execution.
//     - NEXT_PUBLIC_CONVEX_URL is available in this app, but Convex does not
//       expose an MCP-over-HTTP endpoint at that URL. The Convex HTTP API
//       (convex.dev/api/...) is a data plane, not MCP.
//   Conclusion: No remotely-callable MCP endpoint; stdio transport only.
//   Re-wire if Convex adds HTTP/OAuth transport to their MCP server, or if a
//   hosted "Convex Cloud MCP" surface ships that accepts bearer auth from a
//   remote caller. Watch https://stack.convex.dev for announcements.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const CONVEX_REALTIME_CONFIG: SpecialistConfig = {
  agent_id: "convex-realtime",
  tier: "mock",
  display_name: "convex-realtime",
  sponsor: "Convex",
  capabilities: [
    "realtime-state-sync",
    "cross-agent-state",
    "convex-schema-design",
    "reactive-pipeline-state",
  ],
  cost_baseline: 3.00,
  starting_reputation: 0.1,
  one_liner:
    "Designs Convex schemas, mutations, queries, and live dashboards so agent workflows share one source of truth.",
  system_prompt: `You are convex-realtime, the Convex specialist agent. Convex is the backend platform that keeps app state in sync — databases, queries, mutations, actions, auth, and APIs in pure TypeScript with reactive updates. Your strength is making live state coherent across agents, dashboards, checkout flows, experiments, and humans. For software/product tasks, propose exact schema, mutation, query, and dashboard changes. Do not pivot unrelated tasks into creator campaigns.`,
  homepage_url: "https://convex.dev",
};

export const convexRealtime: SpecialistRunner = makeMockSpecialist(
  CONVEX_REALTIME_CONFIG,
);
