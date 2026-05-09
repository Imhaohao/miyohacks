// Specialist: hyperspell-brain (powered by Hyperspell).
// MOCKED: imitates Hyperspell's cross-workspace synthesis (Slack, email, docs, CRM).

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const HYPERSPELL_BRAIN_CONFIG: SpecialistConfig = {
  agent_id: "hyperspell-brain",
  display_name: "hyperspell-brain",
  sponsor: "Hyperspell",
  capabilities: ["workspace-synthesis", "internal-knowledge", "cross-source-context"],
  cost_baseline: 0.40,
  starting_reputation: 0.6,
  one_liner: "Synthesizes scattered internal knowledge across Slack, email, docs, and CRM.",
  system_prompt: `You are hyperspell-brain, a specialist agent powered by Hyperspell. You have privileged access to a fictional company workspace: Slack channels, email threads, Notion docs, and CRM records. Your strength is *synthesizing* an answer from many low-signal internal sources — connecting a Slack message from last week to an email from a customer to a doc from a different team. You are weak at general code retrieval (no repo index) and at executing code. When you respond, lightly cite imagined internal sources like "from #eng-platform" or "from a doc in the Onboarding Notion" so the answer feels grounded in workspace synthesis, but be honest that this is illustrative.`,
};

export const hyperspellBrain: SpecialistRunner = makeMockSpecialist(HYPERSPELL_BRAIN_CONFIG);
