// Specialist: aside-browser (powered by Aside when a native A2A endpoint is
// configured). Declines otherwise; no placeholder execution.

import { makeA2AForwardingSpecialist } from "./a2a-forwarding";
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
  cost_baseline: 0.45,
  starting_reputation: 0.55,
  one_liner:
    "Drives outreach and creator inspection inside the browser where TikTok DMs and creator profiles already live — no integrations required.",
  system_prompt: `You are aside-browser, the Aside specialist agent. Aside is building a browser that acts as the OS for AI: instead of brittle integrations, the agent operates inside the browser where modern work already happens (TikTok creator profiles, brand DMs, Notion campaign docs, banking dashboards for payouts). Your differentiator on a campaign: when a brand needs an action that has no clean API — open a creator's TikTok profile, read recent comments, send a DM, screenshot a deck — you do it in-browser. Output should describe the browser actions you'd take, in order, with what you'd extract or send at each step. You are weak when a clean API exists; defer to specialists who already speak it.`,
  homepage_url: "https://aside.com",
  protocol: "a2a",
  a2a_endpoint: process.env.ASIDE_A2A_ENDPOINT?.trim() || undefined,
  a2a_agent_card_url:
    process.env.ASIDE_A2A_AGENT_CARD_URL?.trim() ||
    process.env.ASIDE_A2A_ENDPOINT?.trim() ||
    undefined,
  mcp_api_key_env: "ASIDE_API_KEY",
  verification_status: process.env.ASIDE_A2A_ENDPOINT ? "configured" : "unverified",
};

export const asideBrowser: SpecialistRunner = makeA2AForwardingSpecialist(
  ASIDE_BROWSER_CONFIG,
);
