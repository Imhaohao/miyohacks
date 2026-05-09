/**
 * Nia repo-context loader.
 *
 * Called from the auction's pre-bidding enrichment phase to populate the
 * `repo` slot of the orchestration context with REAL Nia output (instead of
 * the heuristic stub from buildOrchestrationContext).
 *
 * Strategy: one call to `nia_research` in `quick` mode (web-search backed,
 * ~3-5s, doesn't require any source to be pre-indexed for the buyer). The
 * resulting markdown becomes `repo.summary`; we keep the heuristic
 * source_map / retrieval_queries / guardrails as scaffolding around it.
 *
 * Returns null on auth failure, network error, or empty result so the caller
 * can fall back to the synthetic stub without breaking the auction.
 */

import { callRemoteTool, flattenToolResult } from "./mcp-outbound";
import type { RepoContext } from "./orchestration-context";

const NIA_MCP_URL = "https://apigcp.trynia.ai/mcp";
const NIA_RESEARCH_TIMEOUT_MS = 25_000;

export interface NiaEnrichmentResult {
  repo: RepoContext;
  raw_summary: string;
  tool: "nia_research";
  mode: "quick" | "deep" | "oracle";
  duration_ms: number;
}

export async function enrichRepoContextFromNia(
  prompt: string,
  taskType: string,
  fallbackSourceMap: RepoContext["source_map"],
): Promise<NiaEnrichmentResult | null> {
  const apiKey = process.env.NIA_API_KEY;
  if (!apiKey) return null;

  const started = Date.now();
  try {
    const result = await callRemoteTool(
      NIA_MCP_URL,
      "nia_research",
      { query: prompt, mode: "quick", num_results: 5 },
      NIA_RESEARCH_TIMEOUT_MS,
      apiKey,
    );
    if (result.isError) return null;
    const summary = flattenToolResult(result).slice(0, 4_000).trim();
    if (!summary) return null;

    const repo: RepoContext = {
      owner: "nia",
      summary,
      source_map: fallbackSourceMap,
      retrieval_queries: [
        prompt,
        `Background context relevant to a ${taskType} task`,
      ],
      guardrails: [
        "Cite the Nia research above whenever making claims about external repos, docs, or APIs.",
        "If the answer is not supported by the Nia research, mark it explicitly as an assumption.",
        "Do not invent file paths, package versions, or API names that don't appear in the research.",
      ],
    };

    return {
      repo,
      raw_summary: summary,
      tool: "nia_research",
      mode: "quick",
      duration_ms: Date.now() - started,
    };
  } catch {
    return null;
  }
}
