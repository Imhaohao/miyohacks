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
   * catalog → registry → synthesized.
   */
  preferred_sources?: Array<"catalog" | "registry" | "synthesized">;
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
    discovery_source?: "catalog" | "registry" | "synthesized";
    mcp_endpoint?: string;
    mcp_api_key_env?: string;
    homepage_url?: string;
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
    discovered: true,
    discovery_source: d.discovery_source,
    discovered_for: d.discovered_for,
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
  return await suggestSpecialists(args.prompt, args.task_type, all, topN);
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
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
