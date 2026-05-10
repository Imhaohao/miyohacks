/**
 * Nia repo-context loader.
 *
 * Strategy: try Nia's `search` tool first — it does semantic search across
 * the user's INDEXED sources (GitHub repos, docs, research papers indexed
 * into their Nia workspace). Only if that's empty do we fall back to
 * `nia_research` (web search) as a last resort.
 *
 * Returns null on auth failure, network error, or empty result so the caller
 * can branch into the "ask the user for context" UX without breaking the
 * auction.
 */

import { callRemoteTool, flattenToolResult } from "./mcp-outbound";
import type { RepoContext } from "./orchestration-context";

const NIA_MCP_URL = "https://apigcp.trynia.ai/mcp";
const NIA_TIMEOUT_MS = 25_000;

export type NiaTool = "search" | "nia_research";
export type NiaMode = "indexed" | "quick";

export interface NiaEnrichmentResult {
  repo: RepoContext;
  raw_summary: string;
  tool: NiaTool;
  mode: NiaMode;
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
  let summary = "";
  let tool: NiaTool = "search";
  let mode: NiaMode = "indexed";

  // 1) Try indexed-source search first — this queries the user's actual
  // connected Nia sources (GitHub repos, docs, etc.) instead of the open web.
  try {
    const indexed = await callRemoteTool(
      NIA_MCP_URL,
      "search",
      { query: prompt },
      NIA_TIMEOUT_MS,
      apiKey,
    );
    if (!indexed.isError) {
      summary = flattenToolResult(indexed).slice(0, 4_000).trim();
    }
  } catch {
    // Tool may be unavailable for this account; fall through to web research.
  }

  // 2) If nothing indexed matched, fall back to web research so the auction
  // at least has *something* to ground on — but flag it as a web fallback so
  // the UI can show that we didn't pull from the user's own sources.
  if (!summary) {
    try {
      const research = await callRemoteTool(
        NIA_MCP_URL,
        "nia_research",
        { query: prompt, mode: "quick", num_results: 5 },
        NIA_TIMEOUT_MS,
        apiKey,
      );
      if (!research.isError) {
        summary = flattenToolResult(research).slice(0, 4_000).trim();
        tool = "nia_research";
        mode = "quick";
      }
    } catch {
      return null;
    }
  }

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
      tool === "search"
        ? "Cite the indexed Nia sources above whenever making claims about the repo, internal docs, or APIs."
        : "Cite the Nia research above whenever making claims about external repos, docs, or APIs.",
      "If the answer is not supported by the retrieved context, mark it explicitly as an assumption.",
      "Do not invent file paths, package versions, or API names that don't appear in the context.",
    ],
  };

  return {
    repo,
    raw_summary: summary,
    tool,
    mode,
    duration_ms: Date.now() - started,
  };
}
