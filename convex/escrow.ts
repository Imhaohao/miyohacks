import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const escrowStatusValidator = v.union(
  v.literal("locked"),
  v.literal("released"),
  v.literal("refunded"),
);

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    // Mirror _settle: after an execution failover the active escrow is the
    // most recent locked row, not the first one inserted.
    const rows = await ctx.db
      .query("escrow")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    if (rows.length === 0) return null;
    return (
      [...rows].reverse().find((r) => r.status === "locked") ??
      rows[rows.length - 1]
    );
  },
});

export const _lock = internalMutation({
  args: {
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    seller_id: v.string(),
    locked_amount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("escrow", {
      task_id: args.task_id,
      buyer_id: args.buyer_id,
      seller_id: args.seller_id,
      locked_amount: args.locked_amount,
      status: "locked",
    });
  },
});

async function activeEscrowForTask(ctx: MutationCtx, task_id: Id<"tasks">) {
  const rows = await ctx.db
    .query("escrow")
    .withIndex("by_task", (q) => q.eq("task_id", task_id))
    .collect();
  if (rows.length === 0) return null;
  return (
    [...rows].reverse().find((r) => r.status === "locked") ??
    rows[rows.length - 1]
  );
}

export const _markPaymentRequired = internalMutation({
  args: {
    task_id: v.id("tasks"),
    processor: v.string(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const target = await activeEscrowForTask(ctx, args.task_id);
    if (!target) return null;
    await ctx.db.patch(target._id, {
      payment_processor: args.processor,
      payment_status: "requires_payment",
      stripe_currency: args.currency,
      payment_required_at: Date.now(),
    });
    return target._id;
  },
});

export const _attachStripeCheckout = internalMutation({
  args: {
    task_id: v.id("tasks"),
    stripe_checkout_session_id: v.string(),
    stripe_payment_intent_id: v.optional(v.string()),
    stripe_connected_account_id: v.string(),
    stripe_application_fee_amount: v.number(),
    stripe_currency: v.string(),
  },
  handler: async (ctx, args) => {
    const target = await activeEscrowForTask(ctx, args.task_id);
    if (!target) throw new Error(`escrow for task ${args.task_id} not found`);
    await ctx.db.patch(target._id, {
      payment_processor: "stripe",
      payment_status: "checkout_created",
      stripe_checkout_session_id: args.stripe_checkout_session_id,
      stripe_payment_intent_id: args.stripe_payment_intent_id,
      stripe_connected_account_id: args.stripe_connected_account_id,
      stripe_application_fee_amount: args.stripe_application_fee_amount,
      stripe_currency: args.stripe_currency,
      payment_last_error: undefined,
    });
    return target._id;
  },
});

export const _markStripeAuthorized = internalMutation({
  args: {
    task_id: v.id("tasks"),
    stripe_payment_intent_id: v.string(),
    stripe_checkout_session_id: v.optional(v.string()),
    stripe_charge_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const target = await activeEscrowForTask(ctx, args.task_id);
    if (!target) throw new Error(`escrow for task ${args.task_id} not found`);
    await ctx.db.patch(target._id, {
      payment_processor: "stripe",
      payment_status: "authorized",
      stripe_payment_intent_id: args.stripe_payment_intent_id,
      stripe_checkout_session_id:
        args.stripe_checkout_session_id ?? target.stripe_checkout_session_id,
      stripe_charge_id: args.stripe_charge_id ?? target.stripe_charge_id,
      payment_authorized_at: target.payment_authorized_at ?? Date.now(),
      payment_last_error: undefined,
    });
    return target._id;
  },
});

export const _markStripeCaptured = internalMutation({
  args: {
    task_id: v.id("tasks"),
    stripe_payment_intent_id: v.string(),
    stripe_charge_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const target = await activeEscrowForTask(ctx, args.task_id);
    if (!target) throw new Error(`escrow for task ${args.task_id} not found`);
    await ctx.db.patch(target._id, {
      payment_processor: "stripe",
      payment_status: "captured",
      stripe_payment_intent_id: args.stripe_payment_intent_id,
      stripe_charge_id: args.stripe_charge_id ?? target.stripe_charge_id,
      payment_captured_at: Date.now(),
      payment_last_error: undefined,
    });
    return target._id;
  },
});

export const _markStripeCanceled = internalMutation({
  args: {
    task_id: v.id("tasks"),
    stripe_payment_intent_id: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const target = await activeEscrowForTask(ctx, args.task_id);
    if (!target) throw new Error(`escrow for task ${args.task_id} not found`);
    await ctx.db.patch(target._id, {
      payment_processor: "stripe",
      payment_status: "canceled",
      stripe_payment_intent_id:
        args.stripe_payment_intent_id ?? target.stripe_payment_intent_id,
      payment_canceled_at: Date.now(),
      payment_last_error: args.reason,
    });
    return target._id;
  },
});

export const _settle = internalMutation({
  args: {
    task_id: v.id("tasks"),
    status: escrowStatusValidator,
  },
  handler: async (ctx, args) => {
    // Execution failover can lock a second escrow row for the same task.
    // Settle the most recent still-locked row, not whichever was inserted
    // first (that one may already be refunded).
    const rows = await ctx.db
      .query("escrow")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    if (rows.length === 0) return;
    const target =
      [...rows].reverse().find((r) => r.status === "locked") ??
      rows[rows.length - 1];
    await ctx.db.patch(target._id, { status: args.status });
  },
});
