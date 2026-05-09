/**
 * MCP tool definitions for the creator-campaign marketplace.
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
import { SPECIALISTS } from "@/lib/specialists/registry";

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

// ─── tool definitions ─────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "post_task",
    description:
      "Post a creator-marketing campaign brief. Specialist agents bid for 15 seconds in a sealed-bid Vickrey auction; the highest-scoring bid wins, produces a creator shortlist plus outreach drafts, and pays the second-highest bid price. Returns a task_id and web_view_url.",
    inputSchema: {
      type: "object",
      required: ["prompt", "max_budget"],
      properties: {
        prompt: {
          type: "string",
          description: "Brand campaign brief and desired creator-marketing outcome.",
        },
        max_budget: {
          type: "number",
          description: "Maximum USD willing to pay. Bids above this are rejected.",
        },
        task_type: {
          type: "string",
          description:
            "Optional workflow hint, e.g. 'creator-scouting', 'outreach-drafting', or 'end-to-end-campaign'.",
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
      },
    },
  },
  {
    name: "get_task",
    description:
      "Fetch the current state of a campaign auction: status, bids (only after window closes), creator shortlist/output, judge verdict, and simulated escrow status.",
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
      "List campaign specialist agents with reputation, capabilities, and cost baselines.",
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
  const [task, bids, escrow, lifecycle] = await Promise.all([
    c.query(api.tasks.get, { task_id }),
    c.query(api.bids.forTask, { task_id }),
    c.query(api.escrow.forTask, { task_id }),
    c.query(api.lifecycle.forTask, { task_id }),
  ]);
  return { task, bids, escrow, lifecycle };
}

export async function handleListSpecialists(_args: ListSpecialistsArgs) {
  // Combine the static registry (capabilities, sponsor) with live reputation.
  const live = await convex().query(api.agents.list, {});
  const liveById = new Map(
    (live as Array<{ agent_id: string; reputation_score: number; total_tasks_completed: number }>).map(
      (a) => [a.agent_id, a],
    ),
  );
  return SPECIALISTS.map((s) => {
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
        : "mocked",
      mcp_api_key_env: s.mcp_api_key_env,
      is_verified: s.is_verified ?? false,
      homepage_url: s.homepage_url,
    };
  });
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

// ─── unified dispatch ─────────────────────────────────────────────────────

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "post_task":
      return await handlePostTask(args as unknown as PostTaskArgs);
    case "get_task":
      return await handleGetTask(args as unknown as GetTaskArgs);
    case "list_specialists":
      return await handleListSpecialists(args as ListSpecialistsArgs);
    case "raise_dispute":
      return await handleRaiseDispute(args as unknown as RaiseDisputeArgs);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
