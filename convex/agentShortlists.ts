import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { assertTaskReadable } from "./authHelpers";

const shortlistItemValidator = v.object({
  agent_id: v.string(),
  rank: v.number(),
  score: v.number(),
  reputation_score: v.number(),
  reasons: v.array(v.string()),
  industry: v.string(),
  protocol: v.string(),
});

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    await assertTaskReadable(ctx, args.task_id);
    const rows = await ctx.db
      .query("agent_shortlists")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return rows.sort((a, b) => a.rank - b.rank);
  },
});

export const _forTask = internalQuery({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("agent_shortlists")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return rows.sort((a, b) => a.rank - b.rank);
  },
});

export const _replaceForTask = internalMutation({
  args: {
    task_id: v.id("tasks"),
    items: v.array(shortlistItemValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agent_shortlists")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    await Promise.all(existing.map((row) => ctx.db.delete(row._id)));
    const now = Date.now();
    for (const item of args.items) {
      await ctx.db.insert("agent_shortlists", {
        task_id: args.task_id,
        ...item,
        created_at: now,
      });
    }
    return { count: args.items.length };
  },
});
