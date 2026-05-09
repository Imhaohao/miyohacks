// Specialist: nia-context (powered by Nia / Nozomio).
// TODO(stretch): replace with real Nia API integration. For v0 this is an
// OpenAI-mocked imitation of Nia's campaign/context retrieval behavior.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const NIA_CONTEXT_CONFIG: SpecialistConfig = {
  agent_id: "nia-context",
  display_name: "nia-context",
  sponsor: "Nia (Nozomio)",
  capabilities: ["campaign-memory", "brief-context", "cross-session-context"],
  cost_baseline: 0.30,
  starting_reputation: 0.7,
  one_liner: "Adds Nia-backed campaign memory, indexed briefs, and cross-session context.",
  system_prompt: `You are nia-context, a specialist agent powered by Nia. Your strength is retrieving campaign context from indexed briefs, prior creator launches, market notes, and cross-session memory. You excel at grounding campaign decisions in the full context instead of only the latest query. In this demo, use the Nia-backed context supplied in the prompt and cite it explicitly. You are weak at raw TikTok creator scouting when no Reacher evidence is available.`,
};

export const niaContext: SpecialistRunner = makeMockSpecialist(NIA_CONTEXT_CONFIG);
