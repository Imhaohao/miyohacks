/**
 * Score available specialists against a free-form user query so the UI can
 * surface the best matches before the auction is even opened. Used to answer
 * questions like "who can launch a TikTok shop for me?" without forcing the
 * user to read the full registry.
 */

import { callOpenAIJSON } from "../openai";
import type { SpecialistConfig } from "../types";

export interface SpecialistSuggestion {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  cost_baseline: number;
  fit_score: number;
  fit_reasoning: string;
  discovered: boolean;
  discovery_source?: "catalog" | "registry" | "synthesized";
  /** Real MCP endpoint backing this specialist, if any. */
  mcp_endpoint?: string;
  homepage_url?: string;
}

export interface SuggestResult {
  query: string;
  suggestions: SpecialistSuggestion[];
  best_fit_score: number;
  low_confidence: boolean;
  recommend_discovery: boolean;
}

const LOW_CONFIDENCE_THRESHOLD = 0.55;

interface RankedItem {
  agent_id: string;
  fit_score: number;
  fit_reasoning: string;
}

interface RankResponse {
  ranked: RankedItem[];
}

const RANK_SYSTEM_PROMPT = `You are the routing layer of a creator-marketing agent marketplace. The user describes a goal in plain language; you score how well each available specialist agent fits the goal. Use only the capabilities, sponsor, and one-liner you are shown. Never invent capabilities. Output JSON only with shape:
{ "ranked": [ { "agent_id": "<id>", "fit_score": <0..1>, "fit_reasoning": "<one short sentence>" }, ... ] }
Score 1.0 = directly built for this goal, 0.0 = irrelevant. Include every agent you were given exactly once.`;

function describeSpec(spec: SpecialistConfig): string {
  return [
    `agent_id: ${spec.agent_id}`,
    `sponsor: ${spec.sponsor}`,
    `capabilities: ${spec.capabilities.join(", ")}`,
    `one_liner: ${spec.one_liner}`,
    spec.discovered ? `note: runtime-discovered (${spec.discovered_for ?? ""})` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function rankWithLLM(
  query: string,
  taskType: string | undefined,
  specs: SpecialistConfig[],
): Promise<RankedItem[]> {
  if (specs.length === 0) return [];
  const userPrompt = [
    `User goal:\n${query.trim()}`,
    taskType ? `Workflow hint: ${taskType}` : null,
    "Available specialists:",
    specs.map(describeSpec).join("\n---\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const data = await callOpenAIJSON<RankResponse>({
    systemPrompt: RANK_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 700,
    timeoutMs: 12_000,
    retries: 0,
  });
  if (!Array.isArray(data.ranked)) return [];
  return data.ranked
    .map((r) => ({
      agent_id: String(r.agent_id),
      fit_score: clamp01(Number(r.fit_score)),
      fit_reasoning:
        typeof r.fit_reasoning === "string" && r.fit_reasoning.trim()
          ? r.fit_reasoning.trim()
          : "no rationale provided",
    }))
    .filter((r) => specs.some((s) => s.agent_id === r.agent_id));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function fallbackKeywordRank(
  query: string,
  specs: SpecialistConfig[],
): RankedItem[] {
  const tokens = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
  return specs.map((s) => {
    const haystack = [s.sponsor, s.one_liner, ...s.capabilities]
      .join(" ")
      .toLowerCase();
    let hits = 0;
    for (const t of tokens) if (haystack.includes(t)) hits += 1;
    const fit = tokens.size === 0 ? 0.3 : Math.min(1, hits / Math.max(3, tokens.size));
    return {
      agent_id: s.agent_id,
      fit_score: fit,
      fit_reasoning: hits > 0 ? `Matched ${hits} keyword(s)` : "No keyword overlap",
    };
  });
}

export async function suggestSpecialists(
  query: string,
  taskType: string | undefined,
  specs: SpecialistConfig[],
  topN = 3,
): Promise<SuggestResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      query: trimmed,
      suggestions: [],
      best_fit_score: 0,
      low_confidence: true,
      recommend_discovery: false,
    };
  }

  let ranked: RankedItem[];
  try {
    ranked = await rankWithLLM(trimmed, taskType, specs);
  } catch {
    ranked = fallbackKeywordRank(trimmed, specs);
  }
  if (ranked.length === 0) ranked = fallbackKeywordRank(trimmed, specs);

  const byId = new Map(specs.map((s) => [s.agent_id, s]));
  const suggestions: SpecialistSuggestion[] = [];
  for (const r of ranked) {
    const spec = byId.get(r.agent_id);
    if (!spec) continue;
    suggestions.push({
      agent_id: spec.agent_id,
      display_name: spec.display_name,
      sponsor: spec.sponsor,
      one_liner: spec.one_liner,
      capabilities: spec.capabilities,
      cost_baseline: spec.cost_baseline,
      fit_score: r.fit_score,
      fit_reasoning: r.fit_reasoning,
      discovered: !!spec.discovered,
      discovery_source: spec.discovery_source,
      mcp_endpoint: spec.mcp_endpoint,
      homepage_url: spec.homepage_url,
    });
  }
  suggestions.sort((a, b) => b.fit_score - a.fit_score);
  suggestions.length = Math.min(suggestions.length, topN);

  const best_fit_score = suggestions[0]?.fit_score ?? 0;
  const low_confidence = best_fit_score < LOW_CONFIDENCE_THRESHOLD;
  return {
    query: trimmed,
    suggestions,
    best_fit_score,
    low_confidence,
    recommend_discovery: low_confidence,
  };
}
