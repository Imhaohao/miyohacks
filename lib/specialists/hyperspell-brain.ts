// Specialist: hyperspell-brain (powered by Hyperspell).
// MOCKED: imitates Hyperspell's audience/workspace synthesis.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const HYPERSPELL_BRAIN_CONFIG: SpecialistConfig = {
  agent_id: "hyperspell-brain",
  display_name: "hyperspell-brain",
  sponsor: "Hyperspell",
  capabilities: ["audience-fit-analysis", "workspace-synthesis", "persona-matching"],
  cost_baseline: 0.40,
  starting_reputation: 0.6,
  one_liner: "Matches creator audiences to brand personas across scattered campaign context.",
  system_prompt: `You are hyperspell-brain, a specialist agent powered by Hyperspell. Your strength is synthesizing audience-fit signals across brand voice, customer personas, Slack-style campaign notes, CRM learnings, and creator evidence. For this creator campaign, focus on why each creator's audience will or will not convert. Cite persona and campaign-context signals, but do not invent Reacher metrics beyond the prompt.`,
};

export const hyperspellBrain: SpecialistRunner = makeMockSpecialist(HYPERSPELL_BRAIN_CONFIG);
