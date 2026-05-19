import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const stateValidator = v.union(
  v.literal("submitted"),
  v.literal("working"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

const executionStatusValidator = v.union(
  v.literal("native_mcp"),
  v.literal("native_a2a"),
  v.literal("arbor_real_adapter"),
  v.literal("arbor_sandbox_adapter"),
  v.literal("needs_vendor_a2a_endpoint"),
  v.literal("mock_unconnected"),
);

function requireServerSecret(secret: string | undefined) {
  const expected = process.env.PAYMENT_SERVER_SECRET?.trim();
  if (!expected) {
    throw new Error("PAYMENT_SERVER_SECRET is required");
  }
  if (secret !== expected) {
    throw new Error("invalid payment server secret");
  }
}

/**
 * Persist a brand new A2A task run when message/send (or legacy tasks/send)
 * is accepted. The run starts in `submitted` and the route patches it to
 * `working` -> terminal states.
 */
export const start = mutation({
  args: {
    server_secret: v.optional(v.string()),
    run_id: v.string(),
    agent_id: v.string(),
    execution_status: executionStatusValidator,
    method: v.string(),
    task_type: v.string(),
    prompt: v.string(),
    sandbox_disclosure: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    const existing = await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
    if (existing) return { run_id: args.run_id, idempotent: true };
    const now = Date.now();
    await ctx.db.insert("a2a_task_runs", {
      run_id: args.run_id,
      agent_id: args.agent_id,
      state: "submitted",
      execution_status: args.execution_status,
      method: args.method,
      task_type: args.task_type,
      prompt: args.prompt,
      sandbox_disclosure: args.sandbox_disclosure,
      cancel_requested: false,
      created_at: now,
      updated_at: now,
    });
    return { run_id: args.run_id, idempotent: false };
  },
});

export const setWorking = mutation({
  args: {
    server_secret: v.optional(v.string()),
    run_id: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    const row = await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
    if (!row) return { ok: false };
    if (row.state === "canceled" || row.state === "failed" || row.state === "completed") {
      return { ok: false, terminal: true };
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
    server_secret: v.optional(v.string()),
    run_id: v.string(),
    artifact: v.any(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    const row = await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
    if (!row) return { ok: false };
    // If a cancel raced in before we committed, honor it; the caller may
    // still want to record the artifact as canceled output.
    const state = row.cancel_requested ? ("canceled" as const) : ("completed" as const);
    await ctx.db.patch(row._id, {
      state,
      artifact: args.artifact,
      updated_at: Date.now(),
    });
    return { ok: true, state };
  },
});

export const fail = mutation({
  args: {
    server_secret: v.optional(v.string()),
    run_id: v.string(),
    error_message: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
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

export const cancel = mutation({
  args: {
    run_id: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();
    if (!row) return { ok: false, notFound: true };
    if (row.state === "completed" || row.state === "failed" || row.state === "canceled") {
      return { ok: false, terminal: true, state: row.state };
    }
    await ctx.db.patch(row._id, {
      state: "canceled",
      cancel_requested: true,
      updated_at: Date.now(),
    });
    return { ok: true, state: "canceled" as const };
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

export const listForAgent = query({
  args: { agent_id: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .order("desc")
      .take(args.limit ?? 25);
  },
});
