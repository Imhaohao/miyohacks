import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const BID_WINDOW_SECONDS = 15;

const taskStatusValidator = v.union(
  v.literal("open"),
  v.literal("planning"),
  v.literal("bidding"),
  v.literal("awarded"),
  v.literal("executing"),
  v.literal("judging"),
  v.literal("synthesizing"),
  v.literal("complete"),
  v.literal("disputed"),
  v.literal("failed"),
);

/**
 * Post a new task. Creates the row in `bidding`, schedules bid solicitation
 * immediately and the auction resolution at window close.
 */
export const post = mutation({
  args: {
    posted_by: v.string(),
    task_type: v.optional(v.string()),
    prompt: v.string(),
    max_budget: v.number(),
    output_schema: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const closesAt = now + BID_WINDOW_SECONDS * 1000;
    const task_id = await ctx.db.insert("tasks", {
      posted_by: args.posted_by,
      task_type: args.task_type ?? "general",
      prompt: args.prompt,
      max_budget: args.max_budget,
      output_schema: args.output_schema,
      status: "planning",
      bid_window_seconds: BID_WINDOW_SECONDS,
      bid_window_closes_at: closesAt,
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id,
      event_type: "task_posted",
      payload: {
        posted_by: args.posted_by,
        prompt: args.prompt,
        max_budget: args.max_budget,
      },
    });

    // Planner first: it decides whether the goal is atomic (single auction)
    // or needs decomposition (a chain of sub-task auctions). The planner
    // takes over scheduling solicitBids/resolve from here.
    await ctx.scheduler.runAfter(0, internal.planning.decompose, { task_id });

    return {
      task_id,
      status: "planning" as const,
      bid_window_closes_at: closesAt,
    };
  },
});

/**
 * Internal: create a sub-task for a step in a parent task's plan. The child
 * runs the same auction lifecycle as a top-level task, but skips the planner
 * (children don't recursively decompose) and reports back to the parent on
 * settle.
 */
export const _createChild = internalMutation({
  args: {
    parent_task_id: v.id("tasks"),
    step_index: v.number(),
    prompt: v.string(),
    max_budget: v.number(),
  },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parent_task_id);
    if (!parent) throw new Error(`parent ${args.parent_task_id} not found`);
    const now = Date.now();
    const closesAt = now + BID_WINDOW_SECONDS * 1000;
    const child_task_id = await ctx.db.insert("tasks", {
      posted_by: parent.posted_by,
      task_type: parent.task_type,
      prompt: args.prompt,
      max_budget: args.max_budget,
      status: "bidding",
      bid_window_seconds: BID_WINDOW_SECONDS,
      bid_window_closes_at: closesAt,
      parent_task_id: args.parent_task_id,
      step_index: args.step_index,
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: child_task_id,
      event_type: "task_posted",
      payload: {
        posted_by: parent.posted_by,
        prompt: args.prompt,
        max_budget: args.max_budget,
        parent_task_id: args.parent_task_id,
        step_index: args.step_index,
      },
    });
    return { child_task_id, bid_window_closes_at: closesAt };
  },
});

export const _setPlan = internalMutation({
  args: {
    task_id: v.id("tasks"),
    plan: v.array(
      v.object({
        prompt: v.string(),
        rationale: v.string(),
        specialist_hint: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { task_plan: args.plan });
  },
});

export const _childrenOf = internalQuery({
  args: { parent_task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) =>
        q.eq("parent_task_id", args.parent_task_id),
      )
      .collect();
    return children.sort(
      (a, b) => (a.step_index ?? 0) - (b.step_index ?? 0),
    );
  },
});

export const childrenOf = query({
  args: { parent_task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) =>
        q.eq("parent_task_id", args.parent_task_id),
      )
      .collect();
    return children.sort(
      (a, b) => (a.step_index ?? 0) - (b.step_index ?? 0),
    );
  },
});

/**
 * Public task fetch. Bids are stripped while the auction window is still open
 * (sealed-bid property). Use `bids.forTask` to fetch them after close.
 */
export const get = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    return task;
  },
});

// ─── internal helpers used by auction actions ─────────────────────────────

export const _get = internalQuery({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) throw new Error(`task ${args.task_id} not found`);
    return task;
  },
});

export const _setStatus = internalMutation({
  args: { task_id: v.id("tasks"), status: taskStatusValidator },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { status: args.status });
  },
});

export const _setWinner = internalMutation({
  args: {
    task_id: v.id("tasks"),
    winning_bid_id: v.id("bids"),
    price_paid: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, {
      status: "awarded",
      winning_bid_id: args.winning_bid_id,
      price_paid: args.price_paid,
    });
  },
});

export const _setResult = internalMutation({
  args: { task_id: v.id("tasks"), result: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { result: args.result });
  },
});

export const _setVerdict = internalMutation({
  args: { task_id: v.id("tasks"), verdict: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { judge_verdict: args.verdict });
  },
});
