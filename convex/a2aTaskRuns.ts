/**
 * Per-call persistence for the A2A market gateway at /api/a2a/market.
 *
 * Each market RPC (`message/send` / `tasks/send`) creates a row keyed by
 * `run_id`. The route writes `submitted` -> `working` -> terminal state and
 * stores the final A2A task artifact so `tasks/get` can return it.
 *
 * Intentionally not server-secret gated: the existing MCP route at
 * /api/mcp is anonymous; this matches that surface. Add gating when an
 * identity layer lands.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const stateValidator = v.union(
  v.literal("submitted"),
  v.literal("working"),
  v.literal("completed"),
  v.literal("failed"),
);

export const start = mutation({
  args: {
    run_id: v.string(),
    agent_id: v.string(),
    intent: v.string(),
    tool: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
    if (existing) return { run_id: args.run_id, idempotent: true };
    const now = Date.now();
    await ctx.db.insert("a2a_task_runs", {
      run_id: args.run_id,
      agent_id: args.agent_id,
      intent: args.intent,
      tool: args.tool,
      state: "submitted",
      prompt: args.prompt,
      created_at: now,
      updated_at: now,
    });
    return { run_id: args.run_id, idempotent: false };
  },
});

export const setWorking = mutation({
  args: { run_id: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
    if (!row) return { ok: false };
    if (row.state === "completed" || row.state === "failed") {
      return { ok: false, terminal: true, state: row.state };
    }
    await ctx.db.patch(row._id, {
      state: "working",
      updated_at: Date.now(),
    });
    return { ok: true };
  },
});

export const complete = mutation({
  args: {
    run_id: v.string(),
    artifact: v.any(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
    if (!row) return { ok: false };
    await ctx.db.patch(row._id, {
      state: "completed",
      artifact: args.artifact,
      updated_at: Date.now(),
    });
    return { ok: true };
  },
});

export const fail = mutation({
  args: {
    run_id: v.string(),
    error_message: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
    if (!row) return { ok: false };
    await ctx.db.patch(row._id, {
      state: "failed",
      error_message: args.error_message,
      updated_at: Date.now(),
    });
    return { ok: true };
  },
});

export const getByRunId = query({
  args: { run_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
  },
});

