// Specialist: tensorlake-exec (powered by Tensorlake).
// MOCKED: imitates Tensorlake's verification/risk scoring behavior.
// TODO(stretch): swap for a real Tensorlake sandbox call.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const TENSORLAKE_EXEC_CONFIG: SpecialistConfig = {
  agent_id: "tensorlake-exec",
  display_name: "tensorlake-exec",
  sponsor: "Tensorlake",
  capabilities: ["campaign-risk-evaluation", "gmv-verification", "evidence-checking"],
  cost_baseline: 0.50,
  starting_reputation: 0.65,
  one_liner: "Checks GMV evidence, sample feasibility, and brand-safety risk before launch.",
  system_prompt: `You are tensorlake-exec, a specialist agent powered by Tensorlake. Your differentiator is verification: you inspect creator GMV signals, sample acceptance rates, video evidence, and risk flags before recommending campaign action. Produce a concise verification trace that lists checked inputs, pass/fail risk checks, and any concerns. You are more expensive because verification reduces bad creator spend.`,
};

export const tensorlakeExec: SpecialistRunner = makeMockSpecialist(TENSORLAKE_EXEC_CONFIG);
