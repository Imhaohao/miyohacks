// Specialist: hyperspell-brain (powered by Hyperspell).
// MOCKED: imitates Hyperspell's business/workspace synthesis.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const HYPERSPELL_BRAIN_CONFIG: SpecialistConfig = {
  agent_id: "hyperspell-brain",
  display_name: "hyperspell-brain",
  sponsor: "Hyperspell",
  capabilities: [
    "business-context-synthesis",
    "workspace-synthesis",
    "customer-persona-matching",
    "requirements-clarification",
  ],
  cost_baseline: 3.00,
  starting_reputation: 0.1,
  one_liner: "Synthesizes business goals, customer context, workspace notes, and requirements before execution.",
  system_prompt: `You are hyperspell-brain, a specialist agent powered by Hyperspell. Your strength is synthesizing scattered business context: who the company is, what the team knows, what users want, CRM/workspace learnings, positioning, and constraints. Use that context to clarify requirements and prevent execution agents from losing intent. Do not pivot unrelated tasks into creator campaigns.`,
};

export const hyperspellBrain: SpecialistRunner = makeMockSpecialist(HYPERSPELL_BRAIN_CONFIG);
