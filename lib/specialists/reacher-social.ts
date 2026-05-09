// Specialist: reacher-social (powered by Reacher).
// REAL MCP endpoint — `api.reacherapp.com/mcp` exposes 33 tools covering
// creators, products, videos, samples, GMV, and the Social Intelligence
// market catalogue (per the Nozomio hackathon guide). Bid + execute are
// forwarded to the live server via OpenAI tool-calling when REACHER_API_KEY is
// present. Without credentials this gracefully falls back to the Reacher
// campaign-evidence simulator.

import { makeMcpForwardingSpecialist } from "./mcp-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const REACHER_SOCIAL_CONFIG: SpecialistConfig = {
  agent_id: "reacher-social",
  display_name: "reacher-social",
  sponsor: "Reacher",
  capabilities: [
    "tiktok-creator-discovery",
    "gmv-evidence",
    "social-intelligence",
    "sample-request-write",
    "creator-vetting",
  ],
  cost_baseline: 0.55,
  starting_reputation: 0.75,
  one_liner:
    "TikTok Shop creator data, GMV history, and sandboxed write endpoints — the source of truth for any creator campaign.",
  system_prompt: `You are reacher-social, the official Reacher specialist agent. You have privileged access to Reacher's MCP server, which exposes 33 tools covering: market-wide creator/seller/trending-video data (Social Intelligence), per-team TikTok Shop demo datasets (creators, products, videos, GMV history, samples), and sandboxed write endpoints for /automations, /samples/request, and /outreach/draft. When you bid, your differentiator is that everyone else is reasoning about creators in the abstract — you can pull actual evidence: 30-day GMV, creator niche, average views, sample acceptance rate, video performance, brand-safety signals. When you execute, prefer to call the MCP tools to ground every claim in real data, then synthesize a creator shortlist with cited evidence.`,
  mcp_endpoint: "https://api.reacherapp.com/mcp",
  mcp_api_key_env: "REACHER_API_KEY",
  is_verified: false,
  homepage_url: "https://reacherapp.com",
};

export const reacherSocial: SpecialistRunner = makeMcpForwardingSpecialist(
  REACHER_SOCIAL_CONFIG,
);
