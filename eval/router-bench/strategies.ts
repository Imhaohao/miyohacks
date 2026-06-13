/**
 * Selection strategies under test. Each ranks the specialist pool for a goal and
 * returns agent_ids best-first. The pool is the curated real-MCP catalog.
 *
 *   random    — floor; seeded for reproducibility
 *   lexical   — keyword overlap (mirrors suggest.ts fallbackKeywordRank)
 *   embedding — cosine over a local hashing vectorizer (the "vector search"
 *               baseline the council named)
 *   llm       — the REAL current router: lib/specialists/suggest.ts. This is the
 *               "single-LLM-pick" the product ships today. Needs OPENAI_API_KEY.
 *
 * If `llm` ranks no better than `embedding`, that is the single most important
 * finding of this benchmark — it means today's "routing algorithm" is not yet
 * real IP, exactly as the council warned.
 */

import { MCP_CATALOG, type CatalogEntry } from "../../lib/specialists/catalog";
import { suggestSpecialists } from "../../lib/specialists/suggest";
import type { SpecialistConfig } from "../../lib/types";
import { embed, cosine, type Vec } from "./embed";

export const POOL: CatalogEntry[] = MCP_CATALOG;

const CATALOG_IDS = new Set(MCP_CATALOG.map((e) => e.agent_id));

/** Minimal CatalogEntry → SpecialistConfig so distractors can be ranked by the
 *  real router (suggestSpecialists folds MCP_CATALOG in automatically, so we
 *  only pass the non-catalog pool members as specs). */
function toSpecialistConfig(e: CatalogEntry): SpecialistConfig {
  return {
    agent_id: e.agent_id,
    display_name: e.display_name,
    sponsor: e.sponsor,
    capabilities: e.capabilities,
    system_prompt: "",
    cost_baseline: e.cost_baseline,
    starting_reputation: 1,
    one_liner: e.one_liner,
    tier: "mcp-forwarding",
    mcp_endpoint: e.mcp_endpoint,
    homepage_url: e.homepage_url,
    discovered: true,
    discovery_source: "catalog",
  };
}

export interface Strategy {
  name: string;
  /** Real network/LLM calls required — skipped when no key is present. */
  requiresOpenAI?: boolean;
  rank(goal: string, pool: CatalogEntry[]): Promise<string[]>;
}

// ── helpers ────────────────────────────────────────────────────────────────

function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function specialistDoc(e: CatalogEntry): string {
  // Repeat capabilities + tags to upweight them over the prose one-liner.
  return [
    e.display_name,
    e.sponsor,
    e.one_liner,
    ...e.capabilities,
    ...e.capabilities,
    ...e.domain_tags,
    ...e.domain_tags,
  ].join(" ");
}

// Lazy per-specialist embedding cache (pool is static across a run).
const vecCache = new Map<string, Vec>();
function specialistVec(e: CatalogEntry): Vec {
  let v = vecCache.get(e.agent_id);
  if (!v) {
    v = embed(specialistDoc(e));
    vecCache.set(e.agent_id, v);
  }
  return v;
}

// ── strategies ───────────────────────────────────────────────────────────────

export const randomStrategy: Strategy = {
  name: "random",
  async rank(goal, pool) {
    const rng = mulberry32(seedFromString(goal));
    const ids = pool.map((p) => p.agent_id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  },
};

export const lexicalStrategy: Strategy = {
  name: "lexical",
  async rank(goal, pool) {
    const lowerQuery = goal.toLowerCase();
    const tokens = new Set(
      lowerQuery.split(/[^a-z0-9]+/).filter((t) => t.length > 2),
    );
    const scored = pool.map((s, idx) => {
      const sponsorRoot = s.sponsor.toLowerCase().split(/[\s(]/)[0];
      const tagSet = new Set<string>([
        ...s.capabilities.map((c) => c.toLowerCase()),
        ...s.domain_tags.map((t) => t.toLowerCase()),
      ]);
      let score = 0;
      if (sponsorRoot.length > 2 && lowerQuery.includes(sponsorRoot)) {
        score += 0.85;
      }
      let tagHits = 0;
      for (const tag of tagSet) {
        if (tag.length > 2 && lowerQuery.includes(tag)) tagHits += 1;
      }
      score += Math.min(0.4, 0.18 * tagHits);
      const oneLiner = s.one_liner.toLowerCase();
      let oneLinerHits = 0;
      for (const t of tokens) if (oneLiner.includes(t)) oneLinerHits += 1;
      score += Math.min(0.15, 0.04 * oneLinerHits);
      return { id: s.agent_id, score, idx };
    });
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return scored.map((s) => s.id);
  },
};

export const embeddingStrategy: Strategy = {
  name: "embedding",
  async rank(goal, pool) {
    const gv = embed(goal);
    const scored = pool.map((s, idx) => ({
      id: s.agent_id,
      score: cosine(gv, specialistVec(s)),
      idx,
    }));
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return scored.map((s) => s.id);
  },
};

export const llmStrategy: Strategy = {
  name: "llm",
  requiresOpenAI: true,
  async rank(goal, pool) {
    // suggestSpecialists always folds in MCP_CATALOG; pass any non-catalog pool
    // members (HARD-mode distractors) as specs so they become candidates too.
    // topN = full pool → complete ranking.
    const extras = pool
      .filter((p) => !CATALOG_IDS.has(p.agent_id))
      .map(toSpecialistConfig);
    const result = await suggestSpecialists(goal, undefined, extras, pool.length);
    const poolIds = new Set(pool.map((p) => p.agent_id));
    const ranked = result.suggestions
      .map((s) => s.agent_id)
      .filter((id) => poolIds.has(id));
    // Append any pool ids the ranker dropped so every strategy returns full pool.
    const seen = new Set(ranked);
    for (const p of pool) if (!seen.has(p.agent_id)) ranked.push(p.agent_id);
    return ranked;
  },
};

export const ALL_STRATEGIES: Strategy[] = [
  randomStrategy,
  lexicalStrategy,
  embeddingStrategy,
  llmStrategy,
];
