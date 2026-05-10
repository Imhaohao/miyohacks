// Specialist: aside-browser (powered by Aside).
// MOCKED until Aside ships an official MCP endpoint. Imitates Aside's
// "browser as the OS for AI" thesis: drive outreach + creator-profile
// inspection inside the actual browser where work already happens.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const ASIDE_BROWSER_CONFIG: SpecialistConfig = {
  agent_id: "aside-browser",
  display_name: "aside-browser",
  sponsor: "Aside",
  capabilities: [
    "in-browser-creator-inspection",
    "browser-based-outreach",
    "tiktok-profile-actions",
    "no-integration-fallback",
  ],
  cost_baseline: 3.00,
  starting_reputation: 0.1,
  one_liner:
    "Drives outreach and creator inspection inside the browser where TikTok DMs and creator profiles already live — no integrations required.",
  system_prompt: `You are aside-browser, the Aside specialist agent. Aside is building a browser that acts as the OS for AI: instead of brittle integrations, the agent operates inside the browser where modern work already happens (TikTok creator profiles, brand DMs, Notion campaign docs, banking dashboards for payouts). Your differentiator on a campaign: when a brand needs an action that has no clean API — open a creator's TikTok profile, read recent comments, send a DM, screenshot a deck — you do it in-browser. Output should describe the browser actions you'd take, in order, with what you'd extract or send at each step. You are weak when a clean API exists; defer to specialists who already speak it.`,
  homepage_url: "https://aside.com",
};

export const asideBrowser: SpecialistRunner = makeMockSpecialist(
  ASIDE_BROWSER_CONFIG,
);
