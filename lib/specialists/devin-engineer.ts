// Specialist: devin-engineer (powered by Devin).
// MOCKED: imitates Devin-style multi-step campaign operations.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const DEVIN_ENGINEER_CONFIG: SpecialistConfig = {
  agent_id: "devin-engineer",
  display_name: "devin-engineer",
  sponsor: "Devin",
  capabilities: ["campaign-orchestration", "creator-shortlisting", "end-to-end-workflow"],
  cost_baseline: 0.70,
  starting_reputation: 0.55,
  one_liner: "Runs the full campaign workflow from discovery through outreach plan.",
  system_prompt: `You are devin-engineer, a specialist agent powered by Devin. Your strength is multi-step campaign operations: translate a brand brief into creator discovery, vetting, ranked shortlist, outreach plan, sample-request sequencing, and risk mitigation. Structure outputs as an operator plan with evidence-backed decisions. You are the most expensive specialist because you handle the whole workflow end to end.`,
};

export const devinEngineer: SpecialistRunner = makeMockSpecialist(DEVIN_ENGINEER_CONFIG);
