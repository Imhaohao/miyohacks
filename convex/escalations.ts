import { v } from "convex/values";
import { query } from "./_generated/server";

const escalationValidator = v.object({
  _id: v.id("escalations"),
  _creationTime: v.number(),
  dag_id: v.optional(v.id("hive_dags")),
  task_id: v.id("tasks"),
  kind: v.union(v.literal("low_confidence"), v.literal("conflict_tie")),
  reason: v.string(),
  payload: v.optional(v.any()),
  status: v.union(v.literal("open"), v.literal("resolved")),
  resolution: v.optional(v.string()),
  created_at: v.number(),
  resolved_at: v.optional(v.number()),
});

export const listOpen = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(escalationValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 25)));
    return await ctx.db
      .query("escalations")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(limit);
  },
});

export const forTask = query({
  args: { task_id: v.id("tasks") },
  returns: v.array(escalationValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("escalations")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .collect();
  },
});
