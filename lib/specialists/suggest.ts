/**
 * Score available specialists against a free-form user query so the UI can
 * surface the best matches before the auction is even opened. Used to answer
 * questions like "who can set up Stripe Connect for my marketplace?" without
 * forcing the user to read the full registry.
 *
 * The candidate pool is the live registry **plus** the curated MCP catalog
 * (Stripe, Notion, GitHub, Linear, Vercel, Supabase, Sentry, Atlassian, Neon,
 * Figma, etc.). Catalog entries are surfaced in suggestions even though they
 * haven't been formally registered yet, so the user sees a real-MCP option
 * before having to click Discover.
 */

import { callOpenAIJSON } from "../openai";
import {
  classifyAgentExecution,
  isRealExecutionStatus,
} from "../agent-execution-status";
import { roleForSpecialist } from "../agent-roles";
import type { AgentExecutionStatus, AgentRole, SpecialistConfig } from "../types";
import { MCP_CATALOG, type CatalogEntry } from "./catalog";

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
  execution_status: AgentExecutionStatus;
  agent_role?: AgentRole;
  homepage_url?: string;
  /**
   * True if this suggestion isn't formally enrolled in the marketplace yet —
   * it's a catalog entry the suggester pulled in for ranking. Calling
   * `discover_specialist` with the same prompt enrolls it.
   */
  enrollable: boolean;
}

export interface SuggestResult {
  query: string;
  suggestions: SpecialistSuggestion[];
  best_fit_score: number;
  low_confidence: boolean;
  recommend_discovery: boolean;
}

const LOW_CONFIDENCE_THRESHOLD = 0.55;
const LLM_RANKER_ENABLED = process.env.SUGGEST_LLM_RANKER === "true";

interface RankedItem {
  agent_id: string;
  fit_score: number;
  fit_reasoning: string;
}

interface RankResponse {
  ranked: RankedItem[];
}

const RANK_SYSTEM_PROMPT = `You are the routing layer of a general-purpose marketplace where specialist agents bid on any kind of work — payments, design, code, research, marketing, data, ops, anything. The user describes a goal in plain language; you score how well each available specialist agent fits the goal.

Hard rules:
1. Read the user's goal LITERALLY. If they say "set up Stripe" the goal is payments — not marketing, not creator outreach. Don't infer adjacent intents.
2. Score by capability match only. Ignore sponsor brand recognition, ignore reputation, ignore how many agents of a given category are in the list.
3. Cross-domain bias is a bug. A creator-marketing specialist scoring above 0.3 for a payments task is wrong. A code/engineering agent scoring above 0.3 for a design task is wrong. Be willing to give very low scores (0.0–0.2) to most of the list.
4. Real external specialists (native_mcp, native_a2a, arbor_real_adapter) outscore endpoint-gated or mock entries at the same nominal fit, because they can actually call tools.
5. Context/executive agents can be useful support, but they are not executors. Do not rank them as the best executor for build/implementation/report-generation work.

Use only the capabilities, sponsor, one_liner, and tags you are shown. Never invent capabilities. Decline to inflate any agent's score because they have a strong-sounding name.

You are ranking a prefiltered subset, not the full marketplace. Output JSON only with shape:
{ "ranked": [ { "agent_id": "<id>", "fit_score": <0..1>, "fit_reasoning": "<one short sentence describing the actual capability match>" }, ... ] }
Score 1.0 = directly built for this goal. 0.5 = tangentially relevant. 0.1 = unrelated. Include every agent you were given exactly once.`;

function describeSpec(spec: CandidateSpec): string {
  return [
    `agent_id: ${spec.agent_id}`,
    `sponsor: ${spec.sponsor}`,
    spec.mcp_endpoint
      ? `real_mcp: yes (${spec.mcp_endpoint})`
      : `real_mcp: no`,
    `execution_status: ${spec.execution_status}`,
    `agent_role: ${spec.agent_role ?? "executor"}`,
    `capabilities: ${spec.capabilities.join(", ")}`,
    `one_liner: ${spec.one_liner}`,
    spec.tags && spec.tags.length > 0 ? `tags: ${spec.tags.join(", ")}` : null,
    spec.note ? `note: ${spec.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

interface CandidateSpec {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  cost_baseline: number;
  mcp_endpoint?: string;
  homepage_url?: string;
  discovered: boolean;
  discovery_source?: "catalog" | "registry" | "synthesized";
  enrollable: boolean;
  execution_status: AgentExecutionStatus;
  agent_role?: AgentRole;
  tags?: string[];
  note?: string;
}

function specToCandidate(spec: SpecialistConfig): CandidateSpec {
  const execution_status =
    spec.execution_status ??
    classifyAgentExecution({
      agent_id: spec.agent_id,
      protocol: spec.protocol,
      endpoint_url: spec.mcp_endpoint ?? spec.a2a_endpoint,
      mcp_endpoint: spec.mcp_endpoint,
      a2a_endpoint: spec.a2a_endpoint,
      a2a_agent_card_url: spec.a2a_agent_card_url,
    });
  return {
    agent_id: spec.agent_id,
    display_name: spec.display_name,
    sponsor: spec.sponsor,
    one_liner: spec.one_liner,
    capabilities: spec.capabilities,
    cost_baseline: spec.cost_baseline,
    mcp_endpoint: spec.mcp_endpoint,
    execution_status,
    agent_role: roleForSpecialist(spec),
    homepage_url: spec.homepage_url,
    discovered: !!spec.discovered,
    discovery_source: spec.discovery_source,
    enrollable: false,
    note: spec.discovered
      ? `runtime-discovered (${spec.discovered_for ?? ""})`
      : undefined,
  };
}

function catalogToCandidate(entry: CatalogEntry): CandidateSpec {
  const execution_status = classifyAgentExecution({
    agent_id: entry.agent_id,
    protocol: entry.mcp_endpoint ? "mcp" : undefined,
    mcp_endpoint: entry.mcp_endpoint,
  });
  return {
    agent_id: entry.agent_id,
    display_name: entry.display_name,
    sponsor: entry.sponsor,
    one_liner: entry.one_liner,
    capabilities: entry.capabilities,
    cost_baseline: entry.cost_baseline,
    mcp_endpoint: entry.mcp_endpoint,
    execution_status,
    agent_role: "executor",
    homepage_url: entry.homepage_url,
    discovered: true,
    discovery_source: "catalog",
    enrollable: true,
    tags: entry.domain_tags,
    note: "catalog entry — auto-enrolls when picked",
  };
}

function buildCandidatePool(specs: SpecialistConfig[]): CandidateSpec[] {
  const pool: CandidateSpec[] = specs.map(specToCandidate);
  const taken = new Set(pool.map((c) => c.agent_id));
  for (const entry of MCP_CATALOG) {
    if (taken.has(entry.agent_id)) continue;
    pool.push(catalogToCandidate(entry));
    taken.add(entry.agent_id);
  }
  return pool;
}

async function rankWithLLM(
  query: string,
  taskType: string | undefined,
  pool: CandidateSpec[],
): Promise<RankedItem[]> {
  if (pool.length === 0) return [];
  const userPrompt = [
    `User goal:\n${query.trim()}`,
    taskType && taskType !== "general"
      ? `Workflow hint: ${taskType}`
      : null,
    "Available specialists:",
    pool.map(describeSpec).join("\n---\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const data = await callOpenAIJSON<RankResponse>({
      systemPrompt: RANK_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2400,
      timeoutMs: 18_000,
      retries: 0,
    });
    if (!Array.isArray(data.ranked)) {
      console.warn(
        "[suggest] LLM ranker returned non-array; falling back to keyword rank.",
      );
      return [];
    }
    return data.ranked
      .map((r) => ({
        agent_id: String(r.agent_id),
        fit_score: clamp01(Number(r.fit_score)),
        fit_reasoning:
          typeof r.fit_reasoning === "string" && r.fit_reasoning.trim()
            ? r.fit_reasoning.trim()
            : "no rationale provided",
      }))
      .filter((r) => pool.some((s) => s.agent_id === r.agent_id));
  } catch (err) {
    throw err;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Keyword fallback used when the LLM ranker fails. Cheap heuristic, but
 * meaningful: a direct sponsor-name or capability-tag match in the prompt
 * is treated as a strong signal, so "set up stripe" pulls stripe-payments
 * to the top even when the LLM call dies.
 */
function fallbackKeywordRank(
  query: string,
  pool: CandidateSpec[],
): RankedItem[] {
  const lowerQuery = query.toLowerCase();
  const tokens = new Set(
    lowerQuery.split(/[^a-z0-9]+/).filter((t) => t.length > 2),
  );
  return pool.map((s) => {
    const sponsor = s.sponsor.toLowerCase();
    const sponsorRoot = sponsor.split(/[\s(]/)[0];
    const tagSet = new Set([
      ...s.capabilities.map((c) => c.toLowerCase()),
      ...(s.tags ?? []).map((t) => t.toLowerCase()),
    ]);

    let score = 0;
    const reasons: string[] = [];

    // Direct sponsor-name match — by far the strongest signal.
    if (sponsorRoot.length > 2 && lowerQuery.includes(sponsorRoot)) {
      score += 0.85;
      reasons.push(`mentions ${s.sponsor}`);
    }

    // Domain-tag matches (e.g. "payments", "design") count strongly.
    let tagHits = 0;
    for (const tag of tagSet) {
      if (tag.length > 2 && lowerQuery.includes(tag)) tagHits += 1;
    }
    if (tagHits > 0) {
      score += Math.min(0.4, 0.18 * tagHits);
      reasons.push(`${tagHits} capability/tag match`);
    }

    // Generic token overlap with the one-liner — weakest signal.
    const oneLiner = s.one_liner.toLowerCase();
    let oneLinerHits = 0;
    for (const t of tokens) if (oneLiner.includes(t)) oneLinerHits += 1;
    if (oneLinerHits > 0) {
      score += Math.min(0.15, 0.04 * oneLinerHits);
    }

    if (score === 0) {
      reasons.push("no keyword overlap");
    }
    if (!isRealExecutionStatus(s.execution_status)) {
      score -= s.execution_status === "mock_unconnected" ? 0.75 : 0.35;
      reasons.push(
        s.execution_status === "mock_unconnected"
          ? "not connected for real execution"
          : "needs vendor endpoint",
      );
    }
    if (s.agent_role && s.agent_role !== "executor") {
      score = Math.min(score, 0.45);
      reasons.push(`${s.agent_role} support, not executor`);
    }

    return {
      agent_id: s.agent_id,
      fit_score: clamp01(score),
      fit_reasoning: reasons.join(" · "),
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

  const pool = buildCandidatePool(specs);
  const fallbackRanked = fallbackKeywordRank(trimmed, pool);
  const llmCandidateIds = new Set(
    fallbackRanked.slice(0, 35).map((item) => item.agent_id),
  );
  const llmPool = pool.filter((candidate) =>
    llmCandidateIds.has(candidate.agent_id),
  );

  let ranked: RankedItem[];
  if (LLM_RANKER_ENABLED) {
    try {
      const llmRanked = await rankWithLLM(trimmed, taskType, llmPool);
      const seen = new Set(llmRanked.map((item) => item.agent_id));
      ranked =
        llmRanked.length > 0
          ? [
              ...llmRanked,
              ...fallbackRanked.filter((item) => !seen.has(item.agent_id)),
            ]
          : fallbackRanked;
    } catch {
      ranked = fallbackRanked;
    }
  } else {
    ranked = fallbackRanked;
  }
  if (ranked.length === 0) ranked = fallbackRanked;

  const byId = new Map(pool.map((c) => [c.agent_id, c]));
  const suggestions: SpecialistSuggestion[] = [];
  for (const r of ranked) {
    const c = byId.get(r.agent_id);
    if (!c) continue;
    suggestions.push({
      agent_id: c.agent_id,
      display_name: c.display_name,
      sponsor: c.sponsor,
      one_liner: c.one_liner,
      capabilities: c.capabilities,
      cost_baseline: c.cost_baseline,
      fit_score: r.fit_score,
      fit_reasoning: r.fit_reasoning,
      discovered: c.discovered,
      discovery_source: c.discovery_source,
      mcp_endpoint: c.mcp_endpoint,
      execution_status: c.execution_status,
      agent_role: c.agent_role,
      homepage_url: c.homepage_url,
      enrollable: c.enrollable,
    });
  }
  suggestions.sort((a, b) => b.fit_score - a.fit_score);
  suggestions.length = Math.min(suggestions.length, topN);

  const best_fit_score = suggestions[0]?.fit_score ?? 0;
  const low_confidence = best_fit_score < LOW_CONFIDENCE_THRESHOLD;
  // Only push the user toward Discover (LLM-synth) when even the catalog/
  // registry roster has nothing strong — i.e. no real MCP fits.
  const bestRealFit =
    suggestions.find((s) => isRealExecutionStatus(s.execution_status))
      ?.fit_score ?? 0;
  const recommend_discovery =
    low_confidence && bestRealFit < LOW_CONFIDENCE_THRESHOLD;
  return {
    query: trimmed,
    suggestions,
    best_fit_score,
    low_confidence,
    recommend_discovery,
  };
}
