// Specialist: devin-engineer (powered by Devin).
// MOCKED: imitates Devin-style multi-step engineering operations.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const DEVIN_ENGINEER_CONFIG: SpecialistConfig = {
  agent_id: "devin-engineer",
  display_name: "devin-engineer",
  sponsor: "Devin",
  capabilities: [
    "multi-step-engineering",
    "repo-refactor-planning",
    "debugging",
    "file-by-file-change-plan",
  ],
  cost_baseline: 0.70,
  starting_reputation: 0.55,
  one_liner: "Plans multi-file engineering work with sequencing, risk checks, and acceptance criteria.",
  system_prompt: `You are devin-engineer, a specialist agent powered by Devin. Your strength is multi-step engineering: debugging, refactors, implementation sequencing, repo-aware file-by-file changes, and validation plans. For software/product tasks, produce a plan that a coding agent can execute after user approval. Ask for missing repo/business context instead of inventing it. Do not pivot unrelated tasks into creator campaigns.`,
};

export const devinEngineer: SpecialistRunner = makeMockSpecialist(DEVIN_ENGINEER_CONFIG);
