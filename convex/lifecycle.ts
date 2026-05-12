import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { assertTaskReadable } from "./authHelpers";

export const log = internalMutation({
  args: {
    task_id: v.id("tasks"),
    event_type: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("lifecycle_events", {
      task_id: args.task_id,
      event_type: args.event_type,
      payload: args.payload,
      timestamp: Date.now(),
    });
  },
});

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    await assertTaskReadable(ctx, args.task_id);
    const events = await ctx.db
      .query("lifecycle_events")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return events.sort((a, b) => a.timestamp - b.timestamp);
  },
});

export const _forTask = internalQuery({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("lifecycle_events")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return events.sort((a, b) => a.timestamp - b.timestamp);
  },
});
