import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Public query: probes for a task. Mirrors the sealed-bid window guard used
 * by `bids.forTask` — while the bid window is still open, callers see an
 * empty array. Once the window closes, all probes are visible in the order
 * they were recorded (ascending `created_at`) so the UI can render the
 * probe sequence.
 */
export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) return [];
    if (Date.now() < task.bid_window_closes_at) return [];
    const probes = await ctx.db
      .query("bid_probes")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return probes.sort((a, b) => a.created_at - b.created_at);
  },
});

export const _insert = internalMutation({
  args: {
    task_id: v.id("tasks"),
    bid_id: v.optional(v.id("bids")),
    agent_id: v.string(),
    public_tier: v.string(),
    probe_status: v.union(
      v.literal("pass"),
      v.literal("fail"),
      v.literal("demo_lane"),
    ),
    duration_ms: v.number(),
    response_excerpt: v.optional(v.string()),
    error_message: v.optional(v.string()),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("bid_probes", args);
  },
});

export const _setBidId = internalMutation({
  args: {
    probe_id: v.id("bid_probes"),
    bid_id: v.id("bids"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.probe_id, { bid_id: args.bid_id });
  },
});
