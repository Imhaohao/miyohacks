import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function assertBridgeSecret(value: string | undefined) {
  const expected = process.env.ARBOR_STRIPE_CONVEX_BRIDGE_SECRET;
  if (expected && value !== expected) {
    throw new Error("invalid Stripe bridge secret");
  }
}

export const stripeAccountForAgent = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripe_connected_accounts")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
  },
});

export const upsertStripeAccount = mutation({
  args: {
    bridge_secret: v.optional(v.string()),
    agent_id: v.string(),
    stripe_account_id: v.string(),
    email: v.optional(v.string()),
    charges_enabled: v.boolean(),
    payouts_enabled: v.boolean(),
    details_submitted: v.boolean(),
    requirements_currently_due: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    assertBridgeSecret(args.bridge_secret);
    const now = Date.now();
    const onboarding_status =
      args.charges_enabled && args.payouts_enabled
        ? "complete"
        : args.details_submitted
          ? "submitted"
          : "pending";
    const existing = await ctx.db
      .query("stripe_connected_accounts")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    const patch = {
      stripe_account_id: args.stripe_account_id,
      email: args.email,
      onboarding_status,
      charges_enabled: args.charges_enabled,
      payouts_enabled: args.payouts_enabled,
      details_submitted: args.details_submitted,
      requirements_currently_due: args.requirements_currently_due,
      updated_at: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { account_id: existing._id, stripe_account_id: args.stripe_account_id };
    }
    const account_id = await ctx.db.insert("stripe_connected_accounts", {
      agent_id: args.agent_id,
      ...patch,
      created_at: now,
    });
    return { account_id, stripe_account_id: args.stripe_account_id };
  },
});

export const attachStripeCheckout = mutation({
  args: {
    bridge_secret: v.optional(v.string()),
    task_id: v.id("tasks"),
    stripe_checkout_session_id: v.string(),
    stripe_payment_intent_id: v.optional(v.string()),
    stripe_connected_account_id: v.string(),
    stripe_application_fee_amount: v.number(),
    stripe_currency: v.string(),
  },
  handler: async (ctx, args): Promise<{ escrow_id: Id<"escrow"> | null }> => {
    assertBridgeSecret(args.bridge_secret);
    const escrow_id: Id<"escrow"> | null = await ctx.runMutation(
      internal.escrow._attachStripeCheckout,
      {
        task_id: args.task_id,
        stripe_checkout_session_id: args.stripe_checkout_session_id,
        stripe_payment_intent_id: args.stripe_payment_intent_id,
        stripe_connected_account_id: args.stripe_connected_account_id,
        stripe_application_fee_amount: args.stripe_application_fee_amount,
        stripe_currency: args.stripe_currency,
      },
    );
    await ctx.runMutation(internal.tasks._setPaymentStatus, {
      task_id: args.task_id,
      payment_status: "checkout_created",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "stripe_checkout_created",
      payload: {
        stripe_checkout_session_id: args.stripe_checkout_session_id,
        stripe_payment_intent_id: args.stripe_payment_intent_id,
        stripe_connected_account_id: args.stripe_connected_account_id,
        application_fee_amount: args.stripe_application_fee_amount,
        currency: args.stripe_currency,
      },
    });
    return { escrow_id };
  },
});

export const markStripeAuthorized = mutation({
  args: {
    bridge_secret: v.optional(v.string()),
    task_id: v.id("tasks"),
    stripe_payment_intent_id: v.string(),
    stripe_checkout_session_id: v.optional(v.string()),
    stripe_charge_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertBridgeSecret(args.bridge_secret);
    await ctx.runMutation(internal.escrow._markStripeAuthorized, {
      task_id: args.task_id,
      stripe_payment_intent_id: args.stripe_payment_intent_id,
      stripe_checkout_session_id: args.stripe_checkout_session_id,
      stripe_charge_id: args.stripe_charge_id,
    });
    const task = await ctx.db.get(args.task_id);
    await ctx.runMutation(internal.tasks._setPaymentStatus, {
      task_id: args.task_id,
      payment_status: "authorized",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "stripe_payment_authorized",
      payload: {
        stripe_payment_intent_id: args.stripe_payment_intent_id,
        stripe_checkout_session_id: args.stripe_checkout_session_id,
        stripe_charge_id: args.stripe_charge_id,
      },
    });
    if (task?.status === "requires_payment" && task.winning_bid_id) {
      await ctx.scheduler.runAfter(0, internal.auctions.execute, {
        task_id: args.task_id,
      });
    }
    return { ok: true };
  },
});

export const markStripeCaptured = mutation({
  args: {
    bridge_secret: v.optional(v.string()),
    task_id: v.id("tasks"),
    stripe_payment_intent_id: v.string(),
    stripe_charge_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertBridgeSecret(args.bridge_secret);
    await ctx.runMutation(internal.escrow._markStripeCaptured, {
      task_id: args.task_id,
      stripe_payment_intent_id: args.stripe_payment_intent_id,
      stripe_charge_id: args.stripe_charge_id,
    });
    await ctx.runMutation(internal.tasks._setPaymentStatus, {
      task_id: args.task_id,
      payment_status: "captured",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "stripe_payment_captured",
      payload: {
        stripe_payment_intent_id: args.stripe_payment_intent_id,
        stripe_charge_id: args.stripe_charge_id,
      },
    });
    return { ok: true };
  },
});

export const markStripeCanceled = mutation({
  args: {
    bridge_secret: v.optional(v.string()),
    task_id: v.id("tasks"),
    stripe_payment_intent_id: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertBridgeSecret(args.bridge_secret);
    await ctx.runMutation(internal.escrow._markStripeCanceled, {
      task_id: args.task_id,
      stripe_payment_intent_id: args.stripe_payment_intent_id,
      reason: args.reason,
    });
    await ctx.runMutation(internal.tasks._setPaymentStatus, {
      task_id: args.task_id,
      payment_status: "canceled",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "stripe_payment_canceled",
      payload: {
        stripe_payment_intent_id: args.stripe_payment_intent_id,
        reason: args.reason,
      },
    });
    return { ok: true };
  },
});
