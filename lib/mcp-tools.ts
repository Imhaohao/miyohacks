/**
 * MCP tool definitions for the agent marketplace.
 *
 * Tools live here (instead of inline in the route) so the same definitions can
 * back both the HTTP transport and a future stdio transport without drift.
 *
 * Each tool's `handler` receives a typed argument object and returns a JSON-
 * serializable result. The route handler is responsible for wrapping/unwrapping
 * JSON-RPC envelopes and content blocks.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  SPECIALISTS,
  registerDiscoveredSpecialist,
} from "@/lib/specialists/registry";
import {
  suggestSpecialists,
  type SuggestResult,
  type ReputationMap,
} from "@/lib/specialists/suggest";
import { discoverSpecialist } from "@/lib/specialists/discover";
import type { SpecialistConfig } from "@/lib/types";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// ─── tool input shapes ────────────────────────────────────────────────────

export interface PostTaskArgs {
  prompt: string;
  max_budget: number;
  task_type?: string;
  output_schema?: Record<string, unknown>;
  agent_id?: string;
  business_context?: string;
  repo_context?: string;
  source_hints?: string[];
  workflow_mode?: string;
}

export interface GetTaskArgs {
  task_id: string;
}

export interface ListSpecialistsArgs {
  task_type?: string;
}

export interface RaiseDisputeArgs {
  task_id: string;
  reason: string;
}

export interface OverrideJudgeArgs {
  task_id: string;
  verdict: "accept" | "reject";
  reason: string;
  actor?: string;
}

export interface SuggestSpecialistsArgs {
  prompt: string;
  task_type?: string;
  top_n?: number;
}

export interface DiscoverSpecialistArgs {
  prompt: string;
  task_type?: string;
  /** When false, the discovered config is returned but not persisted. */
  persist?: boolean;
  /** When true, attempt tools/list against the chosen endpoint. */
  verify?: boolean;
  /**
   * Restrict / reorder discovery sources. Default order:
   * catalog → registry → a2a → synthesized.
   */
  preferred_sources?: Array<"catalog" | "registry" | "a2a" | "synthesized">;
}

export interface UpsertProductContextArgs {
  agent_id?: string;
  company_name: string;
  product_url?: string;
  github_repo_url?: string;
  business_context: string;
  repo_context?: string;
  source_hints?: string[];
}

export interface RegisterAgentArgs {
  agent_id: string;
  display_name: string;
  sponsor: string;
  owner_id?: string;
  capabilities: string[];
  one_liner: string;
  system_prompt: string;
  cost_baseline: number;
  starting_reputation?: number;
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  homepage_url?: string;
  fetch_tools?: boolean;
}

export interface SearchAgentsArgs {
  query: string;
  top_k?: number;
  min_reputation?: number;
  max_cost?: number;
  include_unevaluated?: boolean;
}

export interface ScratchpadReadArgs {
  dag_id: string;
}

export interface ScratchpadWriteArgs {
  dag_id: string;
  agent_id: string;
  kind: "observation" | "result" | "decision" | "question";
  content: string;
  confidence: number;
  node_id?: string;
  task_id?: string;
}

export interface ScratchpadRecallArgs {
  dag_id: string;
  query: string;
  limit?: number;
}

// ─── tool definitions ─────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "upsert_product_context",
    description:
      "Save reusable product/business/repo context for a buyer. Future post_task calls from the same agent_id automatically attach this Hyperspell/Nia context before specialists bid.",
    inputSchema: {
      type: "object",
      required: ["company_name", "business_context"],
      properties: {
        agent_id: {
          type: "string",
          description:
            "Caller identifier whose future tasks should use this context. Defaults to 'agent:mcp'.",
        },
        company_name: {
          type: "string",
          description: "Product or company name.",
        },
        product_url: {
          type: "string",
          description: "Optional public product/app URL.",
        },
        github_repo_url: {
          type: "string",
          description: "Optional GitHub repository URL for Nia context.",
        },
        business_context: {
          type: "string",
          description:
            "Hyperspell-owned context: customers, positioning, goals, constraints, prior knowledge, and preferences.",
        },
        repo_context: {
          type: "string",
          description:
            "Nia-owned context: important files, docs, architecture notes, and implementation guardrails.",
        },
        source_hints: {
          type: "array",
          items: { type: "string" },
          description: "Repo paths, docs, URLs, or source IDs Nia should prioritize.",
        },
      },
    },
  },
  {
    name: "post_task",
    description:
      "Post work for specialist agents. Agents bid for 15 seconds in a sealed-bid Vickrey auction; the highest-scoring fit wins and returns either a product artifact, an implementation plan for approval, or a domain-specific deliverable. Returns a task_id and web_view_url.",
    inputSchema: {
      type: "object",
      required: ["prompt", "max_budget"],
      properties: {
        prompt: {
          type: "string",
          description: "The user's goal, brief, or build request.",
        },
        max_budget: {
          type: "number",
          description: "Maximum USD willing to pay. Bids above this are rejected.",
        },
        task_type: {
          type: "string",
          description:
            "Optional workflow hint, e.g. 'implementation-plan', 'pricing-experiment', 'creator-campaign', or 'reacher-live-launch'.",
        },
        output_schema: {
          type: "object",
          description:
            "Optional JSON schema the agent's result should conform to.",
        },
        agent_id: {
          type: "string",
          description:
            "Optional caller identifier. Defaults to 'agent:mcp'. No auth in v0.",
        },
        business_context: {
          type: "string",
          description:
            "Optional Hyperspell-style business context: who this business is, what it knows, and what it wants.",
        },
        repo_context: {
          type: "string",
          description:
            "Optional Nia-style repo/source context: how the repo works and what code/docs/sources the executor should use.",
        },
        source_hints: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional repo paths, docs, URLs, or source IDs that Nia should prioritize.",
        },
        workflow_mode: {
          type: "string",
          description:
            "Optional. Set to 'hive' to run the multi-agent DAG hive planner (parallel nodes + shared scratchpad + DAG evaluation). Omit for the standard sequential planner.",
        },
      },
    },
  },
  {
    name: "get_task",
    description:
      "Fetch current task state: status, bids (only after window closes), output artifact, judge verdict, context packet, and simulated escrow status.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string", description: "Task id from post_task." },
      },
    },
  },
  {
    name: "list_specialists",
    description:
      "List specialist agents with reputation, capabilities, MCP connection status, and cost baselines.",
    inputSchema: {
      type: "object",
      properties: {
        task_type: {
          type: "string",
          description: "Optional filter; future-proofing.",
        },
      },
    },
  },
  {
    name: "suggest_specialists",
    description:
      "Given a free-form goal, return the top specialist agents ranked by literal fit, with reasoning. Flags low-confidence matches so the caller knows when to use discover_specialist.",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: {
          type: "string",
          description: "What the user wants to accomplish.",
        },
        task_type: { type: "string", description: "Optional workflow hint." },
        top_n: {
          type: "integer",
          description: "How many specialists to return. Default 3, max 10.",
        },
      },
    },
  },
  {
    name: "discover_specialist",
    description:
      "Synthesize a brand-new specialist agent tailored to a goal that the existing roster cannot cover well. Persists the new specialist so it can compete in future auctions. Use this when suggest_specialists returns low_confidence: true.",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: {
          type: "string",
          description: "Goal that requires a new specialist.",
        },
        task_type: { type: "string", description: "Optional workflow hint." },
        persist: {
          type: "boolean",
          description:
            "If false, the discovered config is returned without persisting. Defaults to true.",
        },
      },
    },
  },
  {
    name: "raise_dispute",
    description:
      "Raise a dispute on a completed task. The judge re-evaluates with the dispute reason injected; reputation and escrow flow accordingly.",
    inputSchema: {
      type: "object",
      required: ["task_id", "reason"],
      properties: {
        task_id: { type: "string" },
        reason: {
          type: "string",
          description: "One-paragraph explanation of why you dispute the result.",
        },
      },
    },
  },
  {
    name: "override_judge",
    description:
      "Human override for a judge verdict. Records an auditable override and updates settlement without re-running the model judge.",
    inputSchema: {
      type: "object",
      required: ["task_id", "verdict", "reason"],
      properties: {
        task_id: { type: "string" },
        verdict: {
          type: "string",
          enum: ["accept", "reject"],
          description: "Final human decision to force for this task.",
        },
        reason: {
          type: "string",
          description: "One-paragraph explanation for the override.",
        },
        actor: {
          type: "string",
          description: "Optional operator/buyer id. Defaults to agent:mcp.",
        },
      },
    },
  },
  {
    name: "register_agent",
    description:
      "Register an external agent into the Arbor hive registry. Publish your capability schema (and optional MCP/A2A endpoints); a fixed eval gate runs before the agent enters the hive routing pool. Idempotent per agent_id.",
    inputSchema: {
      type: "object",
      required: [
        "agent_id",
        "display_name",
        "sponsor",
        "capabilities",
        "one_liner",
        "system_prompt",
        "cost_baseline",
      ],
      properties: {
        agent_id: {
          type: "string",
          description: "Stable unique id for this agent; re-registering updates it.",
        },
        display_name: {
          type: "string",
          description: "Human-readable name shown in the hive.",
        },
        sponsor: {
          type: "string",
          description: "Org or owner publishing this agent.",
        },
        owner_id: {
          type: "string",
          description: "Optional caller/owner identifier for this registration.",
        },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "Capability tags the agent can fulfill.",
        },
        one_liner: {
          type: "string",
          description: "Short description of what this agent does.",
        },
        system_prompt: {
          type: "string",
          description: "System prompt / instructions that define the agent's behavior.",
        },
        cost_baseline: {
          type: "number",
          description: "Typical USD cost per task; used for cost-based filtering.",
        },
        starting_reputation: {
          type: "number",
          description: "Optional initial reputation score before any judged tasks.",
        },
        mcp_endpoint: {
          type: "string",
          description: "Optional MCP server URL the agent is reachable at.",
        },
        mcp_api_key_env: {
          type: "string",
          description: "env var NAME, never a secret value.",
        },
        a2a_endpoint: {
          type: "string",
          description: "Optional A2A endpoint URL the agent is reachable at.",
        },
        a2a_agent_card_url: {
          type: "string",
          description: "Optional A2A agent card URL.",
        },
        a2a_api_key_env: {
          type: "string",
          description: "env var NAME, never a secret value.",
        },
        homepage_url: {
          type: "string",
          description: "Optional public homepage or docs URL.",
        },
        fetch_tools: {
          type: "boolean",
          description: "If true, attempt to fetch the agent's tools/list at registration.",
        },
      },
    },
  },
  {
    name: "search_agents",
    description:
      "Semantic search over hive-registered agents by capability. Returns top-K candidates by embedding similarity, filtered by reputation and cost. Only eval-passed agents are returned unless include_unevaluated is true.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Free-form capability or goal to match agents against.",
        },
        top_k: {
          type: "integer",
          description: "How many candidates to return. Default 5, clamped to 1..20.",
        },
        min_reputation: {
          type: "number",
          description: "Optional minimum reputation score filter.",
        },
        max_cost: {
          type: "number",
          description: "Optional maximum cost_baseline filter.",
        },
        include_unevaluated: {
          type: "boolean",
          description: "If true, include agents that have not passed the eval gate.",
        },
      },
    },
  },
  {
    name: "scratchpad_read",
    description:
      "Read all shared-scratchpad entries for a hive DAG. Use the dag_id from your node task, or resolve it from your task_id via the task surface.",
    inputSchema: {
      type: "object",
      required: ["dag_id"],
      properties: {
        dag_id: {
          type: "string",
          description: "Hive DAG id returned by dagForTask or a hive task lookup.",
        },
      },
    },
  },
  {
    name: "scratchpad_write",
    description:
      "Append an entry to a hive DAG's shared scratchpad. Stamp it with your agent_id, a kind, and a confidence 0..1. Other agents read this, so be concise and honest about confidence.",
    inputSchema: {
      type: "object",
      required: ["dag_id", "agent_id", "kind", "content", "confidence"],
      properties: {
        dag_id: { type: "string" },
        agent_id: { type: "string" },
        kind: {
          type: "string",
          enum: ["observation", "result", "decision", "question"],
        },
        content: { type: "string" },
        confidence: {
          type: "number",
          description: "Confidence from 0 to 1.",
        },
        node_id: { type: "string" },
        task_id: { type: "string" },
      },
    },
  },
  {
    name: "scratchpad_recall",
    description:
      "Semantic search the shared scratchpad of a hive DAG for entries relevant to a query.",
    inputSchema: {
      type: "object",
      required: ["dag_id", "query"],
      properties: {
        dag_id: { type: "string" },
        query: { type: "string" },
        limit: {
          type: "integer",
          description: "Number of results, clamped to 1..20.",
        },
      },
    },
  },
];

// ─── tool handlers ────────────────────────────────────────────────────────

export async function handlePostTask(args: PostTaskArgs) {
  if (!args.prompt) throw new Error("prompt is required");
  if (typeof args.max_budget !== "number")
    throw new Error("max_budget must be a number");

  const result = await convex().mutation(api.tasks.post, {
    posted_by: args.agent_id ?? "agent:mcp",
    task_type: args.task_type,
    prompt: args.prompt,
    max_budget: args.max_budget,
    output_schema: args.output_schema,
    business_context: args.business_context,
    repo_context: args.repo_context,
    source_hints: args.source_hints,
    workflow_mode: args.workflow_mode,
  });

  return {
    task_id: result.task_id,
    status: result.status,
    bid_window_closes_at: result.bid_window_closes_at,
    web_view_url: `${appUrl()}/task/${result.task_id}`,
  };
}

export async function handleGetTask(args: GetTaskArgs) {
  if (!args.task_id) throw new Error("task_id is required");
  // task_id arrives as a string over the wire; the Convex query validators
  // narrow it to Id<"tasks"> at runtime — cast at the boundary.
  const task_id = args.task_id as Id<"tasks">;
  const c = convex();
  const [task, bids, escrow, lifecycle, context] = await Promise.all([
    c.query(api.tasks.get, { task_id }),
    c.query(api.bids.forTask, { task_id }),
    c.query(api.escrow.forTask, { task_id }),
    c.query(api.lifecycle.forTask, { task_id }),
    c.query(api.taskContexts.forTask, { task_id }),
  ]);
  return { task, bids, escrow, lifecycle, context };
}

export async function handleListSpecialists(_args: ListSpecialistsArgs) {
  // Combine the static registry (capabilities, sponsor) with live reputation.
  const c = convex();
  const [live, all] = await Promise.all([
    c.query(api.agents.list, {}),
    loadAllSpecialists(),
  ]);
  const liveById = new Map(
    (live as Array<{ agent_id: string; reputation_score: number; total_tasks_completed: number }>).map(
      (a) => [a.agent_id, a],
    ),
  );
  return all.map((s) => {
    const l = liveById.get(s.agent_id);
    // market_ready: a single boolean callers can filter on without
    // assembling three fields. Predicate is intentionally weak — we don't
    // yet have runtime connection probes or tool_availability on bids,
    // so the strongest signal we have is "endpoint configured and any
    // required credential is set". Verified status is reported separately
    // via `mcp_connected` for stricter callers.
    const hasEndpoint = !!s.mcp_endpoint || !!s.a2a_endpoint;
    // A2A auth is card-driven at call time; no pre-check beyond the existing
    // mcp_api_key_env convention (a2a_api_key_env is resolved lazily by the runner).
    const credSatisfied =
      !s.mcp_api_key_env || !!process.env[s.mcp_api_key_env];
    const marketReady = hasEndpoint && credSatisfied;
    const marketReadyReason: string | null = marketReady
      ? null
      : !hasEndpoint
        ? "no_endpoint"
        : "missing_credential";
    return {
      agent_id: s.agent_id,
      sponsor: s.sponsor,
      capabilities: s.capabilities,
      cost_baseline: s.cost_baseline,
      one_liner: s.one_liner,
      reputation_score: l?.reputation_score ?? s.starting_reputation,
      total_tasks_completed: l?.total_tasks_completed ?? 0,
      mcp_endpoint: s.mcp_endpoint,
      mcp_connected: !!s.mcp_endpoint && !!s.is_verified,
      mcp_status: s.mcp_endpoint
        ? s.is_verified
          ? "verified"
          : s.mcp_api_key_env
            ? "auth_required"
            : "configured"
        : s.discovered
          ? "discovered"
          : "mocked",
      mcp_api_key_env: s.mcp_api_key_env,
      is_verified: s.is_verified ?? false,
      homepage_url: s.homepage_url,
      discovered: !!s.discovered,
      discovered_for: s.discovered_for,
      market_ready: marketReady,
      market_ready_reason: marketReadyReason,
    };
  });
}

async function loadAllSpecialists(): Promise<SpecialistConfig[]> {
  const c = convex();
  const discovered = (await c.query(api.discoveredSpecialists.list, {})) as Array<{
    agent_id: string;
    display_name: string;
    sponsor: string;
    capabilities: string[];
    system_prompt: string;
    cost_baseline: number;
    starting_reputation: number;
    one_liner: string;
    discovered_for: string;
    discovery_source?: "catalog" | "registry" | "a2a" | "synthesized";
    mcp_endpoint?: string;
    mcp_api_key_env?: string;
    homepage_url?: string;
    a2a_endpoint?: string;
    a2a_agent_card_url?: string;
    a2a_api_key_env?: string;
  }>;
  const discoveredConfigs: SpecialistConfig[] = discovered.map((d) => ({
    agent_id: d.agent_id,
    display_name: d.display_name,
    sponsor: d.sponsor,
    capabilities: d.capabilities,
    system_prompt: d.system_prompt,
    cost_baseline: d.cost_baseline,
    starting_reputation: d.starting_reputation,
    one_liner: d.one_liner,
    mcp_endpoint: d.mcp_endpoint,
    mcp_api_key_env: d.mcp_api_key_env,
    homepage_url: d.homepage_url,
    a2a_endpoint: d.a2a_endpoint,
    a2a_agent_card_url: d.a2a_agent_card_url,
    a2a_api_key_env: d.a2a_api_key_env,
    discovered: true,
    discovery_source: d.discovery_source,
    discovered_for: d.discovered_for,
    tier: d.a2a_endpoint ? "a2a" as const : d.mcp_endpoint ? "mcp-forwarding" as const : "mock" as const,
  }));
  for (const cfg of discoveredConfigs) registerDiscoveredSpecialist(cfg);
  return [...SPECIALISTS, ...discoveredConfigs];
}

export async function handleSuggestSpecialists(
  args: SuggestSpecialistsArgs,
): Promise<SuggestResult> {
  if (typeof args.prompt !== "string" || !args.prompt.trim()) {
    throw new Error("prompt is required");
  }
  const topN =
    typeof args.top_n === "number" && args.top_n > 0
      ? Math.min(10, Math.floor(args.top_n))
      : 3;
  const all = await loadAllSpecialists();
  const reputation = await loadReputationMap();
  return await suggestSpecialists(
    args.prompt,
    args.task_type,
    all,
    topN,
    reputation,
  );
}

/**
 * Per-agent reputation from REAL judged task outcomes (convex
 * `reputation_dimensions`, written by the auction judge in auctions.ts). Feeding
 * this into routing closes the effectiveness loop: specialists that actually did
 * good work rank higher next time. Degrades to {} (today's behavior) if Convex
 * is unreachable, so routing never hard-fails on the reputation lookup.
 */
async function loadReputationMap(): Promise<ReputationMap> {
  try {
    const c = convex();
    const rows = (await c.query(api.reputationDimensions.summaries, {})) as Array<{
      agent_id: string;
      tasks: number;
      overall: number;
    }>;
    const map: ReputationMap = {};
    for (const r of rows) {
      map[r.agent_id] = { overall: r.overall, tasks: r.tasks };
    }
    return map;
  } catch {
    return {};
  }
}

export async function handleDiscoverSpecialist(args: DiscoverSpecialistArgs) {
  if (typeof args.prompt !== "string" || !args.prompt.trim()) {
    throw new Error("prompt is required");
  }
  const persist = args.persist !== false;
  const existing = await loadAllSpecialists();
  const result = await discoverSpecialist({
    query: args.prompt,
    taskType: args.task_type,
    existing,
    verify: args.verify,
    preferred_sources: args.preferred_sources,
  });
  const cfg = result.specialist;

  let persisted = false;
  if (persist) {
    try {
      await convex().mutation(api.discoveredSpecialists.create, {
        agent_id: cfg.agent_id,
        display_name: cfg.display_name,
        sponsor: cfg.sponsor,
        capabilities: cfg.capabilities,
        system_prompt: cfg.system_prompt,
        cost_baseline: cfg.cost_baseline,
        starting_reputation: cfg.starting_reputation,
        one_liner: cfg.one_liner,
        discovered_for: cfg.discovered_for ?? args.prompt,
        discovery_source: cfg.discovery_source,
        mcp_endpoint: cfg.mcp_endpoint,
        mcp_api_key_env: cfg.mcp_api_key_env,
        homepage_url: cfg.homepage_url,
        a2a_endpoint: cfg.a2a_endpoint,
        a2a_agent_card_url: cfg.a2a_agent_card_url,
        a2a_api_key_env: cfg.a2a_api_key_env,
        rationale: result.rationale,
      });
      registerDiscoveredSpecialist(cfg);
      persisted = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`failed to persist discovered specialist: ${msg}`);
    }
  }

  return {
    specialist: {
      agent_id: cfg.agent_id,
      display_name: cfg.display_name,
      sponsor: cfg.sponsor,
      capabilities: cfg.capabilities,
      cost_baseline: cfg.cost_baseline,
      starting_reputation: cfg.starting_reputation,
      one_liner: cfg.one_liner,
      system_prompt: cfg.system_prompt,
      mcp_endpoint: cfg.mcp_endpoint,
      mcp_api_key_env: cfg.mcp_api_key_env,
      homepage_url: cfg.homepage_url,
      a2a_endpoint: cfg.a2a_endpoint,
      a2a_agent_card_url: cfg.a2a_agent_card_url,
      a2a_api_key_env: cfg.a2a_api_key_env,
      discovered: true,
      discovery_source: cfg.discovery_source,
      discovered_for: cfg.discovered_for,
    },
    source: result.source,
    rationale: result.rationale,
    verified_tools: result.verified_tools,
    persisted,
  };
}

export async function handleUpsertProductContext(args: UpsertProductContextArgs) {
  if (!args.company_name?.trim()) throw new Error("company_name is required");
  if (!args.business_context?.trim()) {
    throw new Error("business_context is required");
  }

  const result = await convex().mutation(api.productContext.save, {
    owner_id: args.agent_id ?? "agent:mcp",
    company_name: args.company_name,
    product_url: args.product_url,
    github_repo_url: args.github_repo_url,
    business_context: args.business_context,
    repo_context: args.repo_context,
    source_hints: args.source_hints,
  });

  return {
    ...result,
    attached_to_agent_id: args.agent_id ?? "agent:mcp",
    note: "Future post_task calls from this agent_id will automatically attach this product context.",
  };
}

export async function handleRaiseDispute(args: RaiseDisputeArgs) {
  if (!args.task_id || !args.reason)
    throw new Error("task_id and reason are required");
  await convex().action(api.disputes.raise, {
    task_id: args.task_id as Id<"tasks">,
    reason: args.reason,
  });
  return { ok: true };
}

export async function handleOverrideJudge(args: OverrideJudgeArgs) {
  if (!args.task_id || !args.reason || !args.verdict) {
    throw new Error("task_id, verdict, and reason are required");
  }
  if (args.verdict !== "accept" && args.verdict !== "reject") {
    throw new Error("verdict must be accept or reject");
  }
  return await convex().action(api.disputes.override, {
    task_id: args.task_id as Id<"tasks">,
    verdict: args.verdict,
    reason: args.reason,
    actor: args.actor ?? "agent:mcp",
  });
}

export async function handleRegisterAgent(args: RegisterAgentArgs) {
  const missing: string[] = [];
  if (typeof args.agent_id !== "string" || !args.agent_id.trim())
    missing.push("agent_id");
  if (typeof args.display_name !== "string" || !args.display_name.trim())
    missing.push("display_name");
  if (typeof args.sponsor !== "string" || !args.sponsor.trim())
    missing.push("sponsor");
  if (!Array.isArray(args.capabilities) || args.capabilities.length === 0)
    missing.push("capabilities");
  if (typeof args.one_liner !== "string" || !args.one_liner.trim())
    missing.push("one_liner");
  if (typeof args.system_prompt !== "string" || !args.system_prompt.trim())
    missing.push("system_prompt");
  if (typeof args.cost_baseline !== "number")
    missing.push("cost_baseline");
  if (missing.length > 0) {
    throw new Error(`missing or invalid required fields: ${missing.join(", ")}`);
  }

  // Whitelist only known fields — never spread unknown keys into the action.
  const result = await convex().action(api.hiveRegistry.registerAgent, {
    agent_id: args.agent_id,
    display_name: args.display_name,
    sponsor: args.sponsor,
    owner_id: args.owner_id,
    capabilities: args.capabilities,
    one_liner: args.one_liner,
    system_prompt: args.system_prompt,
    cost_baseline: args.cost_baseline,
    starting_reputation: args.starting_reputation,
    mcp_endpoint: args.mcp_endpoint,
    mcp_api_key_env: args.mcp_api_key_env,
    a2a_endpoint: args.a2a_endpoint,
    a2a_agent_card_url: args.a2a_agent_card_url,
    a2a_api_key_env: args.a2a_api_key_env,
    homepage_url: args.homepage_url,
    fetch_tools: args.fetch_tools,
  });

  return {
    ...result,
    note: "Eval gate runs asynchronously; poll search_agents or GET /api/v1/agents/search until eval_status is passed.",
  };
}

export async function handleSearchAgents(args: SearchAgentsArgs) {
  if (typeof args.query !== "string" || !args.query.trim()) {
    throw new Error("query is required");
  }
  const top_k =
    typeof args.top_k === "number"
      ? Math.min(20, Math.max(1, Math.floor(args.top_k)))
      : undefined;
  const candidates = await convex().action(api.hiveRegistry.searchAgents, {
    query: args.query,
    top_k,
    min_reputation: args.min_reputation,
    max_cost: args.max_cost,
    include_unevaluated: args.include_unevaluated,
  });
  return { query: args.query, candidates };
}

function assertScratchpadKind(
  kind: string,
): asserts kind is ScratchpadWriteArgs["kind"] {
  if (
    kind !== "observation" &&
    kind !== "result" &&
    kind !== "decision" &&
    kind !== "question"
  ) {
    throw new Error("kind must be observation, result, decision, or question");
  }
}

export async function handleScratchpadRead(args: ScratchpadReadArgs) {
  if (!args.dag_id) throw new Error("dag_id is required");
  const entries = await convex().query(api.scratchpad.forDag, {
    dag_id: args.dag_id as Id<"hive_dags">,
  });
  return { dag_id: args.dag_id, entries };
}

export async function handleScratchpadWrite(args: ScratchpadWriteArgs) {
  if (!args.dag_id) throw new Error("dag_id is required");
  if (!args.agent_id?.trim()) throw new Error("agent_id is required");
  if (!args.content?.trim()) throw new Error("content is required");
  assertScratchpadKind(args.kind);
  if (typeof args.confidence !== "number" || !Number.isFinite(args.confidence)) {
    throw new Error("confidence must be a finite number");
  }
  if (args.confidence < 0 || args.confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }

  const result = await convex().action(api.scratchpadActions.write, {
    dag_id: args.dag_id as Id<"hive_dags">,
    agent_id: args.agent_id,
    kind: args.kind,
    content: args.content,
    confidence: args.confidence,
    node_id: args.node_id,
    task_id: args.task_id as Id<"tasks"> | undefined,
  });
  return { dag_id: args.dag_id, ...result };
}

export async function handleScratchpadRecall(args: ScratchpadRecallArgs) {
  if (!args.dag_id) throw new Error("dag_id is required");
  if (!args.query?.trim()) throw new Error("query is required");
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(20, Math.floor(args.limit)))
      : undefined;
  const results = await convex().action(api.scratchpadActions.semanticRecall, {
    dag_id: args.dag_id as Id<"hive_dags">,
    query: args.query,
    limit,
  });
  return { dag_id: args.dag_id, query: args.query, results };
}

// ─── unified dispatch ─────────────────────────────────────────────────────

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "upsert_product_context":
      return await handleUpsertProductContext(
        args as unknown as UpsertProductContextArgs,
      );
    case "post_task":
      return await handlePostTask(args as unknown as PostTaskArgs);
    case "get_task":
      return await handleGetTask(args as unknown as GetTaskArgs);
    case "list_specialists":
      return await handleListSpecialists(args as ListSpecialistsArgs);
    case "suggest_specialists":
      return await handleSuggestSpecialists(
        args as unknown as SuggestSpecialistsArgs,
      );
    case "discover_specialist":
      return await handleDiscoverSpecialist(
        args as unknown as DiscoverSpecialistArgs,
      );
    case "raise_dispute":
      return await handleRaiseDispute(args as unknown as RaiseDisputeArgs);
    case "override_judge":
      return await handleOverrideJudge(args as unknown as OverrideJudgeArgs);
    case "register_agent":
      return await handleRegisterAgent(args as unknown as RegisterAgentArgs);
    case "search_agents":
      return await handleSearchAgents(args as unknown as SearchAgentsArgs);
    case "scratchpad_read":
      return await handleScratchpadRead(args as unknown as ScratchpadReadArgs);
    case "scratchpad_write":
      return await handleScratchpadWrite(args as unknown as ScratchpadWriteArgs);
    case "scratchpad_recall":
      return await handleScratchpadRecall(
        args as unknown as ScratchpadRecallArgs,
      );
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
