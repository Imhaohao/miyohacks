import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

function cleanPatch<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined),
  ) as T;
}

export const start = internalMutation({
  args: {
    task_id: v.id("tasks"),
    agent_id: v.string(),
    phase: v.string(),
    transport: v.string(),
    provider: v.string(),
    endpoint_host: v.optional(v.string()),
    method: v.string(),
    tool_name: v.optional(v.string()),
    call_id: v.optional(v.string()),
    arguments_redacted: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agent_tool_calls", {
      ...args,
      status: "started",
      started_at: now,
      created_at: now,
      updated_at: now,
    });
  },
});

export const succeed = internalMutation({
  args: {
    call_id: v.id("agent_tool_calls"),
    result_preview: v.optional(v.string()),
    external_session_id: v.optional(v.string()),
    external_task_id: v.optional(v.string()),
    pr_url: v.optional(v.string()),
    pr_number: v.optional(v.number()),
    artifact_hash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.call_id);
    if (!row) return { ok: false };
    const now = Date.now();
    // Receipt fields: every successful tool call is one observed state
    // transition; the call has produced an artifact if it returned a PR URL
    // or any non-trivial result payload. artifact_hash is computed by the
    // action-side recorder (where node:crypto is available) and passed in.
    const events_observed = 1;
    const artifact_present =
      !!args.pr_url ||
      !!(args.result_preview && args.result_preview.trim().length > 0);
    await ctx.db.patch(args.call_id, cleanPatch({
      status: "succeeded",
      completed_at: now,
      duration_ms: Math.max(0, now - row.started_at),
      result_preview: args.result_preview,
      external_session_id: args.external_session_id,
      external_task_id: args.external_task_id,
      pr_url: args.pr_url,
      pr_number: args.pr_number,
      events_observed,
      artifact_present,
      artifact_hash: args.artifact_hash,
      updated_at: now,
    }));
    return { ok: true };
  },
});

export const fail = internalMutation({
  args: {
    call_id: v.id("agent_tool_calls"),
    error_message: v.string(),
    result_preview: v.optional(v.string()),
    external_session_id: v.optional(v.string()),
    external_task_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.call_id);
    if (!row) return { ok: false };
    const now = Date.now();
    await ctx.db.patch(args.call_id, cleanPatch({
      status: "failed",
      completed_at: now,
      duration_ms: Math.max(0, now - row.started_at),
      error_message: args.error_message,
      result_preview: args.result_preview,
      external_session_id: args.external_session_id,
      external_task_id: args.external_task_id,
      updated_at: now,
    }));
    return { ok: true };
  },
});

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("agent_tool_calls")
      .withIndex("by_task_id", (q) => q.eq("task_id", args.task_id))
      .take(100);
    return calls.sort((a, b) => a.started_at - b.started_at);
  },
});

// Receipt summary for a task. Used by the auction's execute phase to
// enforce the rule: a task only counts as fulfilled when all three legs
// are present — a real external session id, ≥1 observed event, and a
// captured artifact. Filters to a single agent_id when provided so the
// summary reflects only the winner's tool calls.
export const _fulfilmentSummaryForTask = internalQuery({
  args: {
    task_id: v.id("tasks"),
    agent_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("agent_tool_calls")
      .withIndex("by_task_id", (q) => q.eq("task_id", args.task_id))
      .collect();
    const scoped = args.agent_id
      ? calls.filter((c) => c.agent_id === args.agent_id)
      : calls;
    let external_session_id: string | undefined;
    let events_observed_total = 0;
    let artifact_present = false;
    for (const c of scoped) {
      if (!external_session_id && c.external_session_id) {
        external_session_id = c.external_session_id;
      }
      events_observed_total += c.events_observed ?? 0;
      if (c.artifact_present) artifact_present = true;
    }
    return {
      external_session_id,
      events_observed_total,
      artifact_present,
      total_calls: scoped.length,
    };
  },
});
