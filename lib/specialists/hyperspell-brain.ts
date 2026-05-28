// Specialist: hyperspell-brain (powered by Hyperspell).
//
// Hyperspell does not expose a first-party hosted HTTP MCP endpoint. Their MCP
// server is a local npx process. The Smithery registry
// (smithery.ai/server/@hyperspell/hyperspell-mcp) wraps it as a hosted
// StreamableHTTP proxy that can be reached over the network.
//
// Credentials used by this project (see .env.example):
//   HYPERSPELL_API_KEY  — Hyperspell app token (= HYPERSPELL_TOKEN in their docs)
//   HYPERSPELL_USER_ID  — optional; Hyperspell user context for the session
//
// Note: Smithery also requires its own SMITHERY_API_KEY for platform auth. Since
// the project does NOT ship SMITHERY_API_KEY in .env.example, and Hyperspell's own
// SDK/docs use HYPERSPELL_API_KEY, this specialist uses HYPERSPELL_API_KEY as the
// sole token.  The Smithery URL encodes it as the `hyperspellToken` config param.
// If you have a SMITHERY_API_KEY you can add it via the SMITHERY_API_KEY env var;
// otherwise the URL omits `api_key` and Smithery's anonymous tier is used.
//
// When HYPERSPELL_API_KEY is set → tier:"mcp-forwarding" against Smithery proxy.
// When absent → tier:"mock" (loud console warning, no silent execution).

import { makeMcpForwardingSpecialist } from "./mcp-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

/**
 * Build the Smithery-hosted Hyperspell MCP URL using HYPERSPELL_API_KEY.
 *
 * Smithery encodes per-server config as a base64 JSON blob in the URL query
 * so that their cloud infra can inject the right secrets before proxying to
 * the underlying MCP process. The shape expected by Hyperspell's Smithery
 * deployment is: { "hyperspellToken": "<HYPERSPELL_API_KEY value>" }
 * Optionally, userId can be passed: { "hyperspellToken": "...", "userId": "..." }
 *
 * Reference: smithery.ai/docs/use/connect (StreamableHTTP section)
 */
function buildSmitheryEndpoint(): string | undefined {
  const hyperspellApiKey = process.env.HYPERSPELL_API_KEY?.trim();
  if (!hyperspellApiKey) return undefined;

  const hyperspellUserId = process.env.HYPERSPELL_USER_ID?.trim();
  const configObj: Record<string, string> = { hyperspellToken: hyperspellApiKey };
  if (hyperspellUserId) configObj.userId = hyperspellUserId;

  const bufferCtor = (
    globalThis as typeof globalThis & {
      Buffer?: { from(input: string): { toString(encoding: "base64"): string } };
    }
  ).Buffer;
  const configParam = bufferCtor
    ? bufferCtor.from(JSON.stringify(configObj)).toString("base64")
    : btoa(JSON.stringify(configObj));

  // SMITHERY_API_KEY is optional — Smithery's anonymous tier works without it
  // for low-volume usage, but setting it unlocks higher rate limits.
  const smitheryKey = process.env.SMITHERY_API_KEY?.trim();
  const apiKeyPart = smitheryKey ? `&api_key=${smitheryKey}` : "";

  return `https://server.smithery.ai/@hyperspell/hyperspell-mcp?config=${configParam}${apiKeyPart}`;
}

const resolvedEndpoint = buildSmitheryEndpoint();

export const HYPERSPELL_BRAIN_CONFIG: SpecialistConfig = {
  agent_id: "hyperspell-brain",
  tier: resolvedEndpoint ? "mcp-forwarding" : "mock",
  display_name: "hyperspell-brain",
  sponsor: "Hyperspell",
  capabilities: [
    "business-context-synthesis",
    "workspace-synthesis",
    "customer-persona-matching",
    "requirements-clarification",
  ],
  cost_baseline: 3.00,
  starting_reputation: 0.1,
  one_liner: "Synthesizes business goals, customer context, workspace notes, and requirements before execution.",
  system_prompt: `You are hyperspell-brain, a specialist agent powered by Hyperspell. Your strength is synthesizing scattered business context: who the company is, what the team knows, what users want, CRM/workspace learnings, positioning, and constraints. Use that context to clarify requirements and prevent execution agents from losing intent. Do not pivot unrelated tasks into creator campaigns.`,
  mcp_endpoint: resolvedEndpoint,
  mcp_api_key_env: "HYPERSPELL_API_KEY",
  homepage_url: "https://hyperspell.com",
  is_verified: false, // set true once exercised end-to-end with real credentials
};

// When HYPERSPELL_API_KEY is present, forward to the real Hyperspell MCP via Smithery.
// When not, fall through to makeMockSpecialist via the registry's tier dispatch.
export const hyperspellBrain: SpecialistRunner = resolvedEndpoint
  ? makeMcpForwardingSpecialist(HYPERSPELL_BRAIN_CONFIG)
  : (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { makeMockSpecialist } = require("./base") as typeof import("./base");
      return makeMockSpecialist(HYPERSPELL_BRAIN_CONFIG);
    })();
