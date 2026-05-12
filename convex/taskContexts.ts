import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { assertTaskReadable } from "./authHelpers";

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    await assertTaskReadable(ctx, args.task_id);
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

/**
 * Insert a new context row for a task. Used by the enrichment phase to
 * supersede the synthetic stub written by `tasks.post` once Hyperspell / Nia
 * have produced real context. `forTask` and `_latestForTask` both return the
 * newest row, so the latest insert wins.
 */
export const _insert = internalMutation({
  args: {
    task_id: v.id("tasks"),
    version: v.string(),
    business: v.object({
      owner: v.string(),
      summary: v.string(),
      known_facts: v.array(v.string()),
      goals: v.array(v.string()),
      constraints: v.array(v.string()),
      open_questions: v.array(v.string()),
    }),
    repo: v.object({
      owner: v.string(),
      summary: v.string(),
      source_map: v.array(
        v.object({
          label: v.string(),
          path: v.string(),
          why: v.string(),
        }),
      ),
      retrieval_queries: v.array(v.string()),
      guardrails: v.array(v.string()),
    }),
    routing: v.object({
      owner: v.string(),
      execution_rule: v.string(),
      recommended_specialists: v.array(v.string()),
      context_contract: v.array(v.string()),
    }),
    prompt_addendum: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("task_contexts", {
      task_id: args.task_id,
      version: args.version,
      business: args.business,
      repo: args.repo,
      routing: args.routing,
      prompt_addendum: args.prompt_addendum,
      created_at: Date.now(),
    });
  },
});
