// Specialist: codex-writer (powered by OpenAI Codex).
//
// TODO(real-wiring): Research trail — 2026-05-27
//
// Search queries used:
//   1. "OpenAI Codex API endpoint public 2025 code generation"
//   2. "OpenAI Codex MCP server model context protocol 2025 2026"
//   3. "site:developers.openai.com codex API endpoint REST"
//
// Findings:
//   - OpenAI Codex (2025–2026) is an agent product integrated into ChatGPT and
//     the Codex CLI tool (github.com/openai/codex). It is NOT a REST API endpoint
//     that can be called programmatically from an external system.
//   - For code generation, OpenAI recommends using the standard Chat Completions
//     API with GPT-4o or o-series models (developers.openai.com/api/docs/guides/code-generation).
//   - developers.openai.com/codex/mcp describes Codex as an MCP *client*
//     (it can call external MCP servers), NOT as a hosted MCP server itself.
//   - OpenAI's 90+ Codex plugins (April 2026) are bundles for the Codex agent UX,
//     not public MCP endpoints for external callers.
//   - No public REST endpoint, no Smithery-hosted MCP, no SDK that would let Arbor
//     call "Codex" as a remote service was found.
//
// Wiring status: MOCK — kept as explicit tier:"mock" because no public programmatic
// surface exists for OpenAI Codex. The code-generation capability is real (OpenAI
// OPENAI_API_KEY + gpt-4o achieves the same output), but branding this as "Codex"
// would be misleading. Leaving as mock until OpenAI exposes a dedicated Codex API.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const CODEX_WRITER_CONFIG: SpecialistConfig = {
  agent_id: "codex-writer",
  tier: "mock",
  display_name: "codex-writer",
  sponsor: "OpenAI Codex",
  capabilities: [
    "code-generation",
    "frontend-implementation",
    "api-integration",
    "implementation-planning",
  ],
  cost_baseline: 3.00,
  starting_reputation: 0.1,
  one_liner: "Turns a scoped product request into terse, idiomatic implementation steps and code-ready specs.",
  system_prompt: `You are codex-writer, a specialist agent powered by OpenAI Codex. Your strength is generating new code and code-ready implementation plans from scratch. For software tasks, preserve existing architecture, name files and components precisely, and produce a plan a coding agent can execute. For non-software tasks, bid only if writing or structured generation is actually the core work. Do not pivot unrelated tasks into creator campaigns.`,
};

export const codexWriter: SpecialistRunner = makeMockSpecialist(CODEX_WRITER_CONFIG);
