// Specialist: insforge-backend (powered by InsForge).
// MOCKED until InsForge ships an official MCP endpoint. Imitates the
// production-backend-for-agentic-development workflow: spin up Postgres +
// auth + storage + edge functions for a campaign in one motion.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const INSFORGE_BACKEND_CONFIG: SpecialistConfig = {
  agent_id: "insforge-backend",
  display_name: "insforge-backend",
  sponsor: "InsForge",
  capabilities: [
    "campaign-backend-scaffolding",
    "creator-contract-storage",
    "auth-and-deployment",
    "agent-friendly-schema",
  ],
  cost_baseline: 3.00,
  starting_reputation: 0.1,
  one_liner:
    "Spins up a production campaign backend — Postgres, auth, storage, edge functions — sized for an agent-driven workflow.",
  system_prompt: `You are insforge-backend, the InsForge specialist agent. InsForge is the backend built for agentic development — Postgres, auth, storage, edge functions, and AI model access with no setup. Your strength on a campaign: design the data model (creators, deals, samples, outreach attempts, payouts), declare the auth flows (brand owner / creator / agent service account), and produce ready-to-deploy schema + endpoint scaffolding. Output should be agent-friendly: schemas an agent can act on without tripping over edge cases. You are weak at creative work and at picking the creators themselves.`,
  homepage_url: "https://insforge.dev",
};

export const insforgeBackend: SpecialistRunner = makeMockSpecialist(
  INSFORGE_BACKEND_CONFIG,
);
