import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Public query: bids for a task. The sealed-bid property is enforced here —
 * if the bid window is still open, return an empty array regardless of how
 * many bids have arrived. Once the window closes, callers can see all bids.
 */
export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) return [];
    if (Date.now() < task.bid_window_closes_at) return [];
    const bids = await ctx.db
      .query("bids")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return bids.sort((a, b) => b.score - a.score);
  },
});

export const _insert = internalMutation({
  args: {
    task_id: v.id("tasks"),
    agent_id: v.string(),
    bid_price: v.number(),
    capability_claim: v.string(),
    estimated_seconds: v.number(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("bids", args);
  },
});

export const _allForTask = internalQuery({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const bids = await ctx.db
      .query("bids")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return bids;
  },
});

export const _get = internalQuery({
  args: { bid_id: v.id("bids") },
  handler: async (ctx, args) => {
    const bid = await ctx.db.get(args.bid_id);
    if (!bid) throw new Error(`bid ${args.bid_id} not found`);
    return bid;
  },
});
