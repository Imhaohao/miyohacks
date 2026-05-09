import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("task_contexts")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .first();
  },
});

export const _latestForTask = internalQuery({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("task_contexts")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .first();
  },
});
