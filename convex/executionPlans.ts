import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const planStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("revision_requested"),
  v.literal("cancelled"),
);

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("execution_plans")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .first();
  },
});

export const approvalEventsForTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("approval_events")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return events.sort((a, b) => a.timestamp - b.timestamp);
  },
});

export const _upsert = internalMutation({
  args: {
    task_id: v.id("tasks"),
    agent_id: v.string(),
    status: planStatusValidator,
    plan: v.any(),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("execution_plans")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        agent_id: args.agent_id,
        status: args.status,
        plan: args.plan,
        ...(args.feedback !== undefined ? { feedback: args.feedback } : {}),
        revision_count:
          args.status === "pending"
            ? existing.revision_count + (args.feedback ? 1 : 0)
            : existing.revision_count,
        updated_at: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("execution_plans", {
      task_id: args.task_id,
      agent_id: args.agent_id,
      status: args.status,
      plan: args.plan,
      revision_count: args.feedback ? 1 : 0,
      ...(args.feedback !== undefined ? { feedback: args.feedback } : {}),
      created_at: now,
      updated_at: now,
    });
  },
});

export const approve = mutation({
  args: {
    task_id: v.id("tasks"),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) throw new Error("task not found");
    if (task.status !== "plan_review") {
      throw new Error(`task is ${task.status}, not plan_review`);
    }
    if (task.payment_status && task.payment_status !== "escrow_locked") {
      throw new Error(
        `task payment is ${task.payment_status}, not escrow_locked`,
      );
    }
    const plan = await ctx.db
      .query("execution_plans")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .first();
    if (!plan) throw new Error("no execution plan to approve");

    await ctx.db.patch(plan._id, {
      status: "approved",
      updated_at: Date.now(),
    });
    await ctx.db.insert("approval_events", {
      task_id: args.task_id,
      event_type: "approved",
      actor: args.actor ?? "buyer:web",
      timestamp: Date.now(),
    });
    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "approved",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "execution_plan_approved",
      payload: { actor: args.actor ?? "buyer:web", agent_id: plan.agent_id },
    });
    await ctx.scheduler.runAfter(0, internal.auctions.execute, {
      task_id: args.task_id,
    });
    return { ok: true };
  },
});

export const requestRevision = mutation({
  args: {
    task_id: v.id("tasks"),
    feedback: v.string(),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) throw new Error("task not found");
    if (task.status !== "plan_review") {
      throw new Error(`task is ${task.status}, not plan_review`);
    }
    const plan = await ctx.db
      .query("execution_plans")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .first();
    if (!plan) throw new Error("no execution plan to revise");
    await ctx.db.patch(plan._id, {
      status: "revision_requested",
      feedback: args.feedback,
      updated_at: Date.now(),
    });
    await ctx.db.insert("approval_events", {
      task_id: args.task_id,
      event_type: "revision_requested",
      actor: args.actor ?? "buyer:web",
      reason: args.feedback,
      timestamp: Date.now(),
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "execution_plan_revision_requested",
      payload: {
        actor: args.actor ?? "buyer:web",
        feedback: args.feedback,
      },
    });
    await ctx.scheduler.runAfter(0, internal.auctions.prepareExecutionPlan, {
      task_id: args.task_id,
      revision_feedback: args.feedback,
    });
    return { ok: true };
  },
});

export const cancel = mutation({
  args: {
    task_id: v.id("tasks"),
    reason: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db
      .query("execution_plans")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .first();
    if (plan) {
      await ctx.db.patch(plan._id, {
        status: "cancelled",
        ...(args.reason !== undefined ? { feedback: args.reason } : {}),
        updated_at: Date.now(),
      });
    }
    await ctx.runMutation(internal.escrow._settle, {
      task_id: args.task_id,
      status: "refunded",
    });
    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "cancelled",
    });
    await ctx.db.insert("approval_events", {
      task_id: args.task_id,
      event_type: "cancelled",
      actor: args.actor ?? "buyer:web",
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
      timestamp: Date.now(),
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "task_cancelled",
      payload: { actor: args.actor ?? "buyer:web", reason: args.reason },
    });
    return { ok: true };
  },
});
