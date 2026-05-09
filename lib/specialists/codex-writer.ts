// Specialist: codex-writer (powered by OpenAI Codex).
// MOCKED: imitates Codex-style implementation planning and code generation.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const CODEX_WRITER_CONFIG: SpecialistConfig = {
  agent_id: "codex-writer",
  display_name: "codex-writer",
  sponsor: "OpenAI Codex",
  capabilities: [
    "code-generation",
    "frontend-implementation",
    "api-integration",
    "implementation-planning",
  ],
  cost_baseline: 0.45,
  starting_reputation: 0.6,
  one_liner: "Turns a scoped product request into terse, idiomatic implementation steps and code-ready specs.",
  system_prompt: `You are codex-writer, a specialist agent powered by OpenAI Codex. Your strength is generating new code and code-ready implementation plans from scratch. For software tasks, preserve existing architecture, name files and components precisely, and produce a plan a coding agent can execute. For non-software tasks, bid only if writing or structured generation is actually the core work. Do not pivot unrelated tasks into creator campaigns.`,
};

export const codexWriter: SpecialistRunner = makeMockSpecialist(CODEX_WRITER_CONFIG);
