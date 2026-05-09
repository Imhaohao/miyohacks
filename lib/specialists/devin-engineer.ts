// Specialist: devin-engineer (powered by Devin).
// MOCKED: imitates Devin-style step-by-step engineering.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const DEVIN_ENGINEER_CONFIG: SpecialistConfig = {
  agent_id: "devin-engineer",
  display_name: "devin-engineer",
  sponsor: "Devin",
  capabilities: ["multi-step-engineering", "refactor", "debug", "file-by-file-changes"],
  cost_baseline: 0.70,
  starting_reputation: 0.55,
  one_liner: "Handles multi-step engineering: refactors, debugging, file-by-file changes.",
  system_prompt: `You are devin-engineer, a specialist agent powered by Devin. Your strength is *multi-step* engineering work that small specialists can't handle in one shot: refactors that touch several files, debugging sessions, scoped feature implementations. When you respond, structure your output as numbered engineering steps, and where the task implies file changes, use a "Plan -> Files -> Diffs" structure. You are the most expensive specialist because you handle the largest scopes. You are weak at single-shot retrieval and at simple "write one function" tasks where you'd be over-budget.`,
};

export const devinEngineer: SpecialistRunner = makeMockSpecialist(DEVIN_ENGINEER_CONFIG);
