/**
 * Specialist discovery — find a *real* remote agent that can handle the goal.
 *
 * Strategy, in order:
 *   1. **Curated catalog** (lib/specialists/catalog.ts). Hand-vetted production
 *      HTTP MCP servers with known endpoints. Instant, deterministic.
 *   2. **Live MCP registry search** (lib/specialists/mcp-registry.ts). Hits the
 *      open registry.modelcontextprotocol.io for HTTP-invocable servers.
 *      Optionally verified by fetching `tools/list` against the candidate.
 *   3. **LLM synthesis** (explicit opt-in only). Designs an unavailable
 *      in-persona agent when requested by callers. It is clearly marked
 *      `synthesized` and will not execute unless a real endpoint is later wired.
 *
 * A discovered specialist with `mcp_endpoint` set automatically routes through
 * `makeMcpForwardingSpecialist`, so bid + execute become real MCP tool calls
 * to the remote server — not a renamed in-process LLM.
 */

import { callOpenAIJSON } from "../openai";
import { discoverTools } from "../mcp-outbound";
import type { SpecialistConfig } from "../types";
import { MCP_CATALOG, type CatalogEntry } from "./catalog";
import {
  searchRegistry,
  resolveRegistryUrl,
  type RegistryCandidate,
} from "./mcp-registry";

interface DiscoverArgs {
  query: string;
  taskType?: string;
  /** Existing specialists. Catalog/registry results that overlap are skipped. */
  existing: SpecialistConfig[];
  /**
   * If true, verify the chosen candidate's MCP endpoint with a tools/list call
   * before persisting. Off by default because not every server permits
   * unauthenticated discovery and a 401 shouldn't block the demo.
   */
  verify?: boolean;
  /**
   * Lets callers override the order or skip stages — handy in tests and demos.
   */
  preferred_sources?: Array<"catalog" | "registry" | "synthesized">;
}

export interface DiscoveryResult {
  specialist: SpecialistConfig;
  source: "catalog" | "registry" | "synthesized";
  /** Why this candidate was chosen — surfaced to the UI. */
  rationale: string;
  /**
   * If verify=true and tools/list succeeded, the discovered tool names. Empty
   * array means tools/list wasn't attempted or failed gracefully.
   */
  verified_tools: string[];
}

const DEFAULT_ORDER: Array<"catalog" | "registry" | "synthesized"> = [
  "catalog",
  "registry",
];

const CATALOG_MIN_FIT = 0.55;
const REGISTRY_MIN_FIT = 0.5;

export async function discoverSpecialist(
  args: DiscoverArgs,
): Promise<DiscoveryResult> {
  const order = args.preferred_sources ?? DEFAULT_ORDER;
  const taken = new Set(args.existing.map((s) => s.agent_id));

  for (const stage of order) {
    if (stage === "catalog") {
      const hit = await tryCatalog(args.query, args.taskType, taken);
      if (hit) {
        const verified_tools = args.verify
          ? await safeListTools(hit.specialist.mcp_endpoint!)
          : [];
        return { ...hit, verified_tools };
      }
    } else if (stage === "registry") {
      const hit = await tryRegistry(args.query, args.taskType, taken);
      if (hit) {
        const verified_tools = args.verify
          ? await safeListTools(hit.specialist.mcp_endpoint!)
          : [];
        return { ...hit, verified_tools };
      }
    } else if (stage === "synthesized") {
      const hit = await synthesize(args.query, args.taskType, args.existing, taken);
      return { ...hit, verified_tools: [] };
    }
  }
  // No real remote agent matched. Return an unavailable synthesized record so
  // callers can surface the gap without silently executing a placeholder.
  return await (async () => {
    const hit = await synthesize(args.query, args.taskType, args.existing, taken);
    return { ...hit, verified_tools: [] };
  })();
}

// ─── Stage 1: curated catalog ────────────────────────────────────────────

async function tryCatalog(
  query: string,
  taskType: string | undefined,
  taken: Set<string>,
): Promise<Omit<DiscoveryResult, "verified_tools"> | null> {
  const candidates = MCP_CATALOG.filter((e) => !taken.has(e.agent_id));
  if (candidates.length === 0) return null;

  const ranked = await rankCatalog(query, taskType, candidates);
  const best = ranked[0];
  if (!best || best.fit < CATALOG_MIN_FIT) return null;

  const entry = candidates.find((c) => c.agent_id === best.agent_id);
  if (!entry) return null;

  return {
    specialist: catalogEntryToConfig(entry, query),
    source: "catalog",
    rationale: best.reason,
  };
}

interface CatalogRanking {
  agent_id: string;
  fit: number;
  reason: string;
}

async function rankCatalog(
  query: string,
  taskType: string | undefined,
  entries: CatalogEntry[],
): Promise<CatalogRanking[]> {
  const userPrompt = [
    `User goal:\n${query.trim()}`,
    taskType ? `Workflow hint: ${taskType}` : null,
    "Catalog entries (real production MCP servers):",
    entries
      .map(
        (e) =>
          `- ${e.agent_id} (${e.sponsor}): ${e.one_liner}\n  capabilities: ${e.capabilities.join(", ")}\n  tags: ${e.domain_tags.join(", ")}`,
      )
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const sys = `You match a user's goal to the best real MCP server in a curated catalog. Score each entry 0..1 (1 = direct fit, 0 = irrelevant). Output JSON only:
{ "ranked": [ { "agent_id": "<id>", "fit": <0..1>, "reason": "<one short sentence>" }, ... ] }
Include every entry exactly once. Do not invent agent_ids that aren't in the list.`;

  try {
    const data = await callOpenAIJSON<{ ranked: CatalogRanking[] }>({
      systemPrompt: sys,
      userPrompt,
      maxTokens: 700,
      timeoutMs: 12_000,
      retries: 0,
    });
    const ranked = (data.ranked ?? []).map((r) => ({
      agent_id: String(r.agent_id),
      fit: clamp01(Number(r.fit)),
      reason:
        typeof r.reason === "string" && r.reason.trim()
          ? r.reason.trim()
          : "no rationale",
    }));
    return ranked
      .filter((r) => entries.some((e) => e.agent_id === r.agent_id))
      .sort((a, b) => b.fit - a.fit);
  } catch {
    return keywordRankCatalog(query, entries);
  }
}

function keywordRankCatalog(
  query: string,
  entries: CatalogEntry[],
): CatalogRanking[] {
  const tokens = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
  return entries
    .map((e) => {
      const haystack = [
        e.sponsor,
        e.one_liner,
        ...e.capabilities,
        ...e.domain_tags,
      ]
        .join(" ")
        .toLowerCase();
      let hits = 0;
      for (const t of tokens) if (haystack.includes(t)) hits += 1;
      const fit =
        tokens.size === 0 ? 0.3 : Math.min(1, hits / Math.max(2, tokens.size));
      return {
        agent_id: e.agent_id,
        fit,
        reason: hits > 0 ? `Matched ${hits} keyword(s)` : "no keyword overlap",
      };
    })
    .sort((a, b) => b.fit - a.fit);
}

function catalogEntryToConfig(
  entry: CatalogEntry,
  query: string,
): SpecialistConfig {
  return {
    agent_id: entry.agent_id,
    display_name: entry.display_name,
    sponsor: entry.sponsor,
    capabilities: entry.capabilities,
    cost_baseline: entry.cost_baseline,
    starting_reputation: 0.55,
    one_liner: entry.one_liner,
    system_prompt: `You are ${entry.display_name}, an MCP-equipped specialist for ${entry.sponsor}. The marketplace registered you because the user goal lined up with your real capabilities (${entry.capabilities.join(", ")}). Use your remote tools to ground your answer in real data — never invent results. If the goal is outside what your tools can do, say so plainly and decline. Treat the user's request on its own terms; don't assume it's marketing/campaign work unless they say so.`,
    mcp_endpoint: entry.mcp_endpoint,
    mcp_api_key_env: entry.mcp_api_key_env,
    is_verified: false,
    homepage_url: entry.homepage_url,
    discovered: true,
    discovery_source: "catalog",
    discovered_for: query.trim().slice(0, 240),
  };
}

// ─── Stage 2: live registry search ───────────────────────────────────────

async function tryRegistry(
  query: string,
  taskType: string | undefined,
  taken: Set<string>,
): Promise<Omit<DiscoveryResult, "verified_tools"> | null> {
  let candidates: RegistryCandidate[];
  try {
    candidates = await searchRegistry(query, 12);
  } catch {
    return null;
  }
  candidates = candidates.filter((c) => {
    const slug = candidateSlug(c);
    return !taken.has(slug);
  });
  if (candidates.length === 0) return null;

  const ranked = await rankRegistry(query, taskType, candidates);
  const best = ranked[0];
  if (!best || best.fit < REGISTRY_MIN_FIT) return null;

  const candidate = candidates.find((c) => c.id === best.candidate_id);
  if (!candidate) return null;

  // Resolve URL templating with empty vars; if any are required the registry
  // is telling us the agent can't run without secrets we don't have. Skip.
  const { url: resolved, missing } = resolveRegistryUrl(candidate, {});
  if (missing.length > 0) {
    return {
      specialist: registryCandidateToConfig(candidate, query, resolved, true),
      source: "registry",
      rationale: `${best.reason} (needs ${missing.join(", ")} to actually run)`,
    };
  }

  return {
    specialist: registryCandidateToConfig(candidate, query, resolved, false),
    source: "registry",
    rationale: best.reason,
  };
}

interface RegistryRanking {
  candidate_id: string;
  fit: number;
  reason: string;
}

async function rankRegistry(
  query: string,
  taskType: string | undefined,
  candidates: RegistryCandidate[],
): Promise<RegistryRanking[]> {
  const userPrompt = [
    `User goal:\n${query.trim()}`,
    taskType ? `Workflow hint: ${taskType}` : null,
    "Live MCP registry candidates:",
    candidates
      .map(
        (c) =>
          `- id: ${c.id}\n  name: ${c.name}\n  publisher: ${c.publisher ?? "unknown"}\n  description: ${truncate(c.description, 240)}\n  url: ${c.url}`,
      )
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const sys = `You match a user goal to the best live MCP server from a registry. Score each candidate 0..1 (1 = direct fit). Output JSON only: { "ranked": [ { "candidate_id": "<id>", "fit": <0..1>, "reason": "<short>" } ] }. Use only the provided candidate_ids.`;

  try {
    const data = await callOpenAIJSON<{ ranked: RegistryRanking[] }>({
      systemPrompt: sys,
      userPrompt,
      maxTokens: 700,
      timeoutMs: 12_000,
      retries: 0,
    });
    return (data.ranked ?? [])
      .map((r) => ({
        candidate_id: String(r.candidate_id),
        fit: clamp01(Number(r.fit)),
        reason:
          typeof r.reason === "string" && r.reason.trim()
            ? r.reason.trim()
            : "no rationale",
      }))
      .filter((r) => candidates.some((c) => c.id === r.candidate_id))
      .sort((a, b) => b.fit - a.fit);
  } catch {
    return keywordRankRegistry(query, candidates);
  }
}

function keywordRankRegistry(
  query: string,
  candidates: RegistryCandidate[],
): RegistryRanking[] {
  const tokens = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
  return candidates
    .map((c) => {
      const hay = `${c.name} ${c.description}`.toLowerCase();
      let hits = 0;
      for (const t of tokens) if (hay.includes(t)) hits += 1;
      const fit =
        tokens.size === 0 ? 0.3 : Math.min(1, hits / Math.max(2, tokens.size));
      return {
        candidate_id: c.id,
        fit,
        reason: hits > 0 ? `Matched ${hits} keyword(s)` : "no keyword overlap",
      };
    })
    .sort((a, b) => b.fit - a.fit);
}

function candidateSlug(c: RegistryCandidate): string {
  const base = c.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return base || c.id.slice(0, 36);
}

function registryCandidateToConfig(
  c: RegistryCandidate,
  query: string,
  resolvedUrl: string,
  hasMissingVars: boolean,
): SpecialistConfig {
  const slug = candidateSlug(c);
  const capabilities = inferCapabilities(c);
  return {
    agent_id: slug,
    display_name: slug,
    sponsor: c.publisher ?? c.name,
    capabilities,
    cost_baseline: 0.55,
    starting_reputation: 0.5,
    one_liner: truncate(c.description || c.name, 160),
    system_prompt: `You are ${slug}, an MCP-equipped specialist discovered from the live MCP registry. Your remote tools (advertised by ${c.name}) are the source of truth. ${hasMissingVars ? "Note: this server's URL template still has unresolved variables — call the user out if you'd need credentials before running." : "Use your remote tools to ground every claim in real data."}`,
    mcp_endpoint: resolvedUrl,
    is_verified: false,
    homepage_url: c.homepage,
    discovered: true,
    discovery_source: "registry",
    discovered_for: query.trim().slice(0, 240),
  };
}

function inferCapabilities(c: RegistryCandidate): string[] {
  const desc = (c.description || c.name).toLowerCase();
  const buckets = [
    { tag: "data-fetch", hits: ["read", "fetch", "search", "query"] },
    { tag: "write-ops", hits: ["create", "update", "delete", "post", "send"] },
    { tag: "browser", hits: ["browser", "playwright", "puppeteer", "scrape"] },
    { tag: "payments", hits: ["payment", "stripe", "checkout", "invoice"] },
    { tag: "design", hits: ["design", "figma", "ui", "frontend"] },
    { tag: "code-ops", hits: ["repo", "github", "pull request", "ci"] },
    { tag: "messaging", hits: ["message", "slack", "email", "outreach"] },
  ];
  const matched = buckets.filter((b) => b.hits.some((h) => desc.includes(h)));
  return matched.length ? matched.map((b) => b.tag) : ["mcp-tools"];
}

// ─── Stage 3: LLM synthesis (last resort) ────────────────────────────────

async function synthesize(
  query: string,
  taskType: string | undefined,
  existing: SpecialistConfig[],
  taken: Set<string>,
): Promise<Omit<DiscoveryResult, "verified_tools">> {
  const sys = `You design unavailable specialist records for a general-purpose marketplace where agents bid on any kind of work — payments, design, code, research, marketing, data, ops, anything. The user describes a goal the existing roster and the live MCP registry cannot cover well; you invent a clearly non-executing specialist profile tailored to that goal.

Stay in the user's domain — don't drift toward marketing/campaign framing unless that's literally what they asked for. If the goal is "set up Stripe Connect", build a payments specialist, not a marketing one.

Output JSON only with: agent_id (kebab-case 3-40 chars), display_name, sponsor (suffix " (synthesized)"), one_liner (<=120 chars), capabilities (3-6 short verb-noun), system_prompt (2-4 sentences, second person), cost_baseline (0.30-1.20).
Do not duplicate any existing agent_id.`;

  const userPrompt = [
    `User goal:\n${query.trim()}`,
    taskType ? `Workflow hint: ${taskType}` : null,
    "Existing specialists (do not duplicate):",
    existing
      .map(
        (s) =>
          `- ${s.agent_id} (${s.sponsor}): ${s.one_liner} [${s.capabilities.join(", ")}]`,
      )
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw: Partial<{
    agent_id: string;
    display_name: string;
    sponsor: string;
    one_liner: string;
    capabilities: string[];
    system_prompt: string;
    cost_baseline: number;
  }> = {};
  try {
    raw = await callOpenAIJSON({
      systemPrompt: sys,
      userPrompt,
      maxTokens: 700,
      timeoutMs: 18_000,
      retries: 0,
    });
  } catch {
    /* fall through */
  }

  const fallbackBase =
    slugify(query.split(/\s+/).slice(0, 4).join(" ")) || "specialist";
  const candidateId =
    typeof raw.agent_id === "string" && /^[a-z0-9][a-z0-9-]{2,40}$/.test(raw.agent_id)
      ? raw.agent_id
      : fallbackBase;
  const agent_id = uniqueAgentId(candidateId, taken);

  const capabilities = Array.isArray(raw.capabilities) && raw.capabilities.length > 0
    ? raw.capabilities
        .map((c) => String(c).trim())
        .filter((c) => c.length > 0 && c.length < 80)
        .slice(0, 6)
    : ["custom-workflow", "campaign-execution"];

  const cfg: SpecialistConfig = {
    agent_id,
    display_name:
      typeof raw.display_name === "string" && raw.display_name.trim()
        ? raw.display_name.trim()
        : agent_id,
    sponsor:
      typeof raw.sponsor === "string" && raw.sponsor.trim()
        ? raw.sponsor.trim()
        : "Discovery (synthesized)",
    capabilities,
    cost_baseline: clampCost(raw.cost_baseline),
    starting_reputation: 0.5,
    one_liner:
      typeof raw.one_liner === "string" && raw.one_liner.trim()
        ? raw.one_liner.trim().slice(0, 200)
        : `Synthesized specialist for: ${query.trim().slice(0, 80)}`,
    system_prompt: `${
      typeof raw.system_prompt === "string" && raw.system_prompt.trim()
        ? raw.system_prompt.trim()
        : `You are ${agent_id}, a non-executing specialist profile synthesized for the goal: "${query.trim()}".`
    } You have no remote MCP or A2A tools. Decline execution until a real endpoint is configured.`,
    discovered: true,
    discovery_source: "synthesized",
    discovered_for: query.trim().slice(0, 240),
  };

  return {
    specialist: cfg,
    source: "synthesized",
    rationale:
      "No real MCP specialist matched well in the catalog or live registry — synthesized a non-executing profile to show the capability gap.",
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────

async function safeListTools(url: string): Promise<string[]> {
  try {
    const tools = await discoverTools(url);
    return tools.map((t) => t.name);
  } catch {
    return [];
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampCost(n: unknown): number {
  const num = typeof n === "number" && Number.isFinite(n) ? n : 0.55;
  return Math.max(0.3, Math.min(1.2, Number(num.toFixed(2))));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function uniqueAgentId(base: string, taken: Set<string>): string {
  let id = base;
  let i = 2;
  while (taken.has(id)) {
    id = `${base}-${i}`;
    i += 1;
    if (i > 50) {
      id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      break;
    }
  }
  return id;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
