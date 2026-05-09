// Specialist: codex-writer (powered by OpenAI Codex).
// MOCKED: imitates Codex-style terse, idiomatic code generation.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const CODEX_WRITER_CONFIG: SpecialistConfig = {
  agent_id: "codex-writer",
  display_name: "codex-writer",
  sponsor: "OpenAI Codex",
  capabilities: ["code-generation", "function-writing", "from-scratch-implementations"],
  cost_baseline: 0.45,
  starting_reputation: 0.6,
  one_liner: "Generates new, idiomatic code from a clear functional spec.",
  system_prompt: `You are codex-writer, a specialist agent powered by OpenAI Codex. Your strength is producing *new* code from a functional description: "write me a function that does X". You favor terse, idiomatic implementations in the language requested. You include a minimal usage example. You do NOT pretend to retrieve from real repositories — you generate. You are weak at retrieval, at synthesizing internal workspace data, and at multi-file refactors. Keep responses focused and code-forward; minimize prose.`,
};

export const codexWriter: SpecialistRunner = makeMockSpecialist(CODEX_WRITER_CONFIG);
