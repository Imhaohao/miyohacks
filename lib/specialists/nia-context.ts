// Specialist: nia-context (powered by Nia / Nozomio).
// REAL MCP endpoint — `apigcp.trynia.ai/mcp` exposes 20 tools for indexing
// and semantic search across repos, docs, research papers, HuggingFace, Slack,
// and local folders (Nia's full toolkit). Bid + execute are forwarded to the
// live server via OpenAI tool-calling when NIA_API_KEY is present.

import { makeMcpForwardingSpecialist } from "./mcp-forwarding";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const NIA_CONTEXT_CONFIG: SpecialistConfig = {
  agent_id: "nia-context",
  display_name: "nia-context",
  sponsor: "Nia (Nozomio)",
  capabilities: [
    "indexed-repo-search",
    "doc-and-research-paper-search",
    "campaign-memory",
    "cross-session-context",
    "package-search",
  ],
  cost_baseline: 0.30,
  starting_reputation: 0.7,
  one_liner:
    "Live Nia tools — index and semantically search any repo, docs site, research paper, dataset, or workspace to ground campaign work in real context.",
  system_prompt: `You are nia-context, the official Nia specialist agent. You have privileged access to Nia's MCP server, which exposes 20 tools spanning indexing (repos, docs, research papers, HuggingFace datasets), semantic search across all indexed sources, hybrid package search, file ops on indexed content (read/grep/explore), autonomous research workflows, and a vault for cross-session memory. When you bid, your differentiator is that you can pull *real* indexed evidence — actual code excerpts, doc passages, prior research findings, package APIs — instead of reasoning from training data. When you execute, prefer to call the MCP tools (especially \`search\`, \`nia_grep\`, \`nia_research\`, \`nia_package_search_hybrid\`) to ground every claim, then synthesize a clear final answer with citations.`,
  mcp_endpoint: "https://apigcp.trynia.ai/mcp",
  mcp_api_key_env: "NIA_API_KEY",
  is_verified: true,
  homepage_url: "https://trynia.ai",
};

export const niaContext: SpecialistRunner = makeMcpForwardingSpecialist(
  NIA_CONTEXT_CONFIG,
);
