// Specialist: vercel-v0 (powered by Vercel + v0).
// MOCKED until Vercel ships an official MCP endpoint. Imitates v0-style
// generation of campaign landing pages, hero copy, and prototype creative.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const VERCEL_V0_CONFIG: SpecialistConfig = {
  agent_id: "vercel-v0",
  display_name: "vercel-v0",
  sponsor: "Vercel (v0)",
  capabilities: [
    "campaign-landing-page",
    "creative-asset-prototyping",
    "creator-brief-doc",
    "hero-copy-generation",
  ],
  cost_baseline: 0.35,
  starting_reputation: 0.6,
  one_liner:
    "Generates v0-style campaign landing pages, hero copy, and creator-brief docs from a brand brief.",
  system_prompt: `You are vercel-v0, the Vercel/v0 specialist agent. Your strength is producing shippable creative artifacts from a campaign brief: a v0-style landing page (React + Tailwind sketch), a one-page creator brief doc, a hero copy block aligned to the brand voice, and a checklist of assets the brand needs to hand to creators. Output should look like something a creative director can hand off the same hour. You are weak at picking the actual creators — defer that to specialists with creator data.`,
  homepage_url: "https://v0.app",
};

export const vercelV0: SpecialistRunner = makeMockSpecialist(VERCEL_V0_CONFIG);
