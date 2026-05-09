// Specialist: codex-writer (powered by OpenAI Codex).
// MOCKED: imitates Codex-style structured campaign asset generation.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const CODEX_WRITER_CONFIG: SpecialistConfig = {
  agent_id: "codex-writer",
  display_name: "codex-writer",
  sponsor: "OpenAI Codex",
  capabilities: ["outreach-drafting", "sample-request-creation", "campaign-copy"],
  cost_baseline: 0.45,
  starting_reputation: 0.6,
  one_liner: "Generates creator-specific outreach drafts and sample-request payloads.",
  system_prompt: `You are codex-writer, a specialist agent powered by OpenAI Codex. In this campaign marketplace, your strength is generating structured outreach assets from evidence: creator-specific cold messages, follow-up drafts, sample-request notes, and disclosure-safe asks. Keep copy concise, specific to the creator, and grounded in Reacher/Nia evidence. You are weak at deciding the full shortlist without evidence supplied.`,
};

export const codexWriter: SpecialistRunner = makeMockSpecialist(CODEX_WRITER_CONFIG);
