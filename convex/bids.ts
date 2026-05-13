import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { assertTaskReadable } from "./authHelpers";

/**
 * Public query: bids for a task. The sealed-bid property is enforced here —
 * if the bid window is still open, return an empty array regardless of how
 * many bids have arrived. Once the window closes, callers can see all bids.
 */
export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await assertTaskReadable(ctx, args.task_id);
    if (Date.now() < task.bid_window_closes_at) return [];
    const bids = await ctx.db
      .query("bids")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return bids.sort(
      (a, b) => (b.value_score ?? b.score) - (a.value_score ?? a.score),
    );
  },
});

export const _insert = internalMutation({
  args: {
    task_id: v.id("tasks"),
    agent_id: v.string(),
    agent_role: v.optional(
      v.union(
        v.literal("executive"),
        v.literal("context"),
        v.literal("executor"),
        v.literal("judge"),
      ),
    ),
    bid_price: v.number(),
    capability_claim: v.string(),
    estimated_seconds: v.number(),
    score: v.number(),
    task_fit_score: v.optional(v.number()),
    historical_quality: v.optional(v.number()),
    acceptance_rate: v.optional(v.number()),
    reliability_score: v.optional(v.number()),
    speed_score: v.optional(v.number()),
    estimate_accuracy: v.optional(v.number()),
    availability_score: v.optional(v.number()),
    expected_quality: v.optional(v.number()),
    latency_penalty: v.optional(v.number()),
    effective_price: v.optional(v.number()),
    value_score: v.optional(v.number()),
    execution_preview: v.optional(v.string()),
    tool_availability: v.optional(
      v.object({
        status: v.union(
          v.literal("available"),
          v.literal("manual"),
          v.literal("mock"),
          v.literal("missing"),
        ),
        checked: v.array(v.string()),
        missing: v.optional(v.array(v.string())),
        reason: v.optional(v.string()),
      }),
    ),
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
