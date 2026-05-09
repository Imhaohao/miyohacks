import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const MIN_AGENT_ID = /^[a-z0-9][a-z0-9-]{2,40}$/;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("discovered_specialists").collect();
    return rows.sort((a, b) => b.created_at - a.created_at);
  },
});

export const _getByAgentId = internalQuery({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
  },
});

const SPECIALIST_FIELDS = {
  agent_id: v.string(),
  display_name: v.string(),
  sponsor: v.string(),
  capabilities: v.array(v.string()),
  system_prompt: v.string(),
  cost_baseline: v.number(),
  starting_reputation: v.number(),
  one_liner: v.string(),
  discovered_for: v.string(),
  discovery_source: v.optional(
    v.union(
      v.literal("catalog"),
      v.literal("registry"),
      v.literal("synthesized"),
    ),
  ),
  mcp_endpoint: v.optional(v.string()),
  mcp_api_key_env: v.optional(v.string()),
  homepage_url: v.optional(v.string()),
  rationale: v.optional(v.string()),
};

export const create = mutation({
  args: SPECIALIST_FIELDS,
  handler: async (ctx, args) => {
    if (!MIN_AGENT_ID.test(args.agent_id)) {
      throw new Error(
        `Invalid agent_id "${args.agent_id}" — must be kebab-case, 3-40 chars`,
      );
    }

    const existing = await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (existing) {
      throw new Error(`agent_id "${args.agent_id}" already exists`);
    }
    const conflictingSponsor = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (conflictingSponsor) {
      throw new Error(`agent_id "${args.agent_id}" collides with a sponsor`);
    }

    const created_at = Date.now();
    const id = await ctx.db.insert("discovered_specialists", {
      ...args,
      created_at,
    });

    await ctx.db.insert("agents", {
      agent_id: args.agent_id,
      display_name: args.display_name,
      sponsor: args.sponsor,
      capabilities: args.capabilities,
      system_prompt: args.system_prompt,
      cost_per_task_estimate: args.cost_baseline,
      reputation_score: args.starting_reputation,
      total_tasks_completed: 0,
      total_disputes_lost: 0,
    });

    return { id, agent_id: args.agent_id, created_at };
  },
});

