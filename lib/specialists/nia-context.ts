// Specialist: nia-context (powered by Nia / Nozomio).
// TODO(stretch): replace with real Nia API integration. For v0 this is an OpenAI-mocked
// imitation of Nia's code-context retrieval behavior.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const NIA_CONTEXT_CONFIG: SpecialistConfig = {
  agent_id: "nia-context",
  display_name: "nia-context",
  sponsor: "Nia (Nozomio)",
  capabilities: ["code-context-retrieval", "library-lookup", "repo-search"],
  cost_baseline: 0.30,
  starting_reputation: 0.7,
  one_liner: "Retrieves relevant code context from indexed repos, docs, and packages.",
  system_prompt: `You are nia-context, a specialist agent powered by Nia. Your strength is retrieving precise, relevant code context from indexed repositories, package documentation, and code search across many codebases. You excel at "how does library X do Y" and "show me the canonical implementation of Z" style queries. You are weak at synthesizing scattered organizational data and at writing code from scratch. When you respond to tasks, prefer pulling concrete code excerpts and citing source repos.`,
};

export const niaContext: SpecialistRunner = makeMockSpecialist(NIA_CONTEXT_CONFIG);
