import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    return agents.sort((a, b) => b.reputation_score - a.reputation_score);
  },
});

export const _getByAgentId = internalQuery({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
  },
});

/**
 * Idempotent insert for catalog/discovered specialists that haven't been
 * seeded yet. Skips if a row already exists.
 */
export const _ensureAgent = internalMutation({
  args: {
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    capabilities: v.array(v.string()),
    system_prompt: v.string(),
    cost_per_task_estimate: v.number(),
    starting_reputation: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (existing) return { _id: existing._id, created: false };
    const _id = await ctx.db.insert("agents", {
      agent_id: args.agent_id,
      display_name: args.display_name,
      sponsor: args.sponsor,
      capabilities: args.capabilities,
      system_prompt: args.system_prompt,
      cost_per_task_estimate: args.cost_per_task_estimate,
      reputation_score: args.starting_reputation,
      total_tasks_completed: 0,
      total_disputes_lost: 0,
    });
    return { _id, created: true };
  },
});

const REPUTATION_MIN = 0.05;
const REPUTATION_MAX = 1.0;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export const _applyReputationDelta = internalMutation({
  args: {
    agent_id: v.string(),
    task_id: v.id("tasks"),
    delta: v.number(),
    event_type: v.string(),
    reasoning: v.string(),
    increment_completed: v.boolean(),
    increment_disputes_lost: v.boolean(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!agent) throw new Error(`agent ${args.agent_id} not found`);
    const new_score = clamp(
      agent.reputation_score + args.delta,
      REPUTATION_MIN,
      REPUTATION_MAX,
    );
    await ctx.db.patch(agent._id, {
      reputation_score: new_score,
      total_tasks_completed:
        agent.total_tasks_completed + (args.increment_completed ? 1 : 0),
      total_disputes_lost:
        agent.total_disputes_lost + (args.increment_disputes_lost ? 1 : 0),
    });
    await ctx.db.insert("reputation_events", {
      agent_id: args.agent_id,
      task_id: args.task_id,
      event_type: args.event_type,
      delta: args.delta,
      reasoning: args.reasoning,
      new_score,
    });
    return { new_score };
  },
});
