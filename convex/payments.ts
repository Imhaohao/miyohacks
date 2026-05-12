import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { assertTaskReadable, requireAccountId } from "./authHelpers";
import {
  CREDIT_CURRENCY,
  FREE_TRIAL_CREDITS,
  calculateEscrowSettlement,
  roundMoney,
} from "../lib/payments";

const checkoutStatusValidator = v.union(
  v.literal("created"),
  v.literal("completed"),
  v.literal("expired"),
  v.literal("failed"),
);

const onboardingStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("pending"),
  v.literal("complete"),
  v.literal("restricted"),
);

function requirePaymentServer(secret: string | undefined) {
  const expected = process.env.PAYMENT_SERVER_SECRET;
  if (expected && secret !== expected) {
    throw new Error("invalid payment server secret");
  }
}

async function existingLedger(ctx: MutationCtx, idempotencyKey: string) {
  return await ctx.db
    .query("ledger_entries")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotency_key", idempotencyKey),
    )
    .first();
}

async function ensureBuyerWallet(ctx: MutationCtx, buyerId: string) {
  const existing = await ctx.db
    .query("buyer_wallets")
    .withIndex("by_buyer", (q) => q.eq("buyer_id", buyerId))
    .first();
  if (existing) return existing;
  const now = Date.now();
  const walletId = await ctx.db.insert("buyer_wallets", {
    buyer_id: buyerId,
    available_credits: 0,
    reserved_credits: 0,
    lifetime_purchased: 0,
    lifetime_granted: 0,
    lifetime_spent: 0,
    updated_at: now,
  });
  const created = await ctx.db.get(walletId);
  if (!created) throw new Error("failed to create buyer wallet");
  return created;
}

async function ensureAgentWallet(ctx: MutationCtx, agentId: string) {
  const existing = await ctx.db
    .query("agent_wallets")
    .withIndex("by_agent", (q) => q.eq("agent_id", agentId))
    .first();
  if (existing) return existing;
  const now = Date.now();
  const walletId = await ctx.db.insert("agent_wallets", {
    agent_id: agentId,
    available_earnings: 0,
    pending_earnings: 0,
    lifetime_earned: 0,
    lifetime_paid_out: 0,
    updated_at: now,
  });
  const created = await ctx.db.get(walletId);
  if (!created) throw new Error("failed to create agent wallet");
  return created;
}

async function insertLedger(
  ctx: MutationCtx,
  args: {
    account_id: string;
    account_type: "buyer" | "agent" | "platform" | "escrow";
    entry_type:
      | "credit_purchase"
      | "trial_credit_grant"
      | "credit_reserve"
      | "credit_release"
      | "credit_refund"
      | "escrow_release"
      | "agent_earning_available"
      | "agent_payout"
      | "agent_payout_failed"
      | "platform_fee";
    amount: number;
    task_id?: Id<"tasks">;
    stripe_event_id?: string;
    stripe_session_id?: string;
    stripe_transfer_id?: string;
    idempotency_key: string;
  },
) {
  const existing = await existingLedger(ctx, args.idempotency_key);
  if (existing) return existing._id;
  return await ctx.db.insert("ledger_entries", {
    account_id: args.account_id,
    account_type: args.account_type,
    entry_type: args.entry_type,
    amount: roundMoney(args.amount),
    currency: CREDIT_CURRENCY,
    ...(args.task_id ? { task_id: args.task_id } : {}),
    ...(args.stripe_event_id ? { stripe_event_id: args.stripe_event_id } : {}),
    ...(args.stripe_session_id
      ? { stripe_session_id: args.stripe_session_id }
      : {}),
    ...(args.stripe_transfer_id
      ? { stripe_transfer_id: args.stripe_transfer_id }
      : {}),
    idempotency_key: args.idempotency_key,
    created_at: Date.now(),
  });
}

export const walletForBuyer = query({
  args: { buyer_id: v.string() },
  handler: async (ctx, args) => {
    const wallet = await ctx.db
      .query("buyer_wallets")
      .withIndex("by_buyer", (q) => q.eq("buyer_id", args.buyer_id))
      .first();
    return (
      wallet ?? {
        buyer_id: args.buyer_id,
        available_credits: 0,
        reserved_credits: 0,
        lifetime_purchased: 0,
        lifetime_granted: 0,
        lifetime_spent: 0,
        updated_at: 0,
      }
    );
  },
});

export const agentWallet = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const wallet = await ctx.db
      .query("agent_wallets")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .first();
    return (
      wallet ?? {
        agent_id: args.agent_id,
        available_earnings: 0,
        pending_earnings: 0,
        lifetime_earned: 0,
        lifetime_paid_out: 0,
        updated_at: 0,
      }
    );
  },
});

export const ledgerForBuyer = query({
  args: { buyer_id: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("ledger_entries")
      .withIndex("by_account", (q) =>
        q.eq("account_type", "buyer").eq("account_id", args.buyer_id),
      )
      .order("desc")
      .take(args.limit ?? 25);
    return rows;
  },
});

export const myWallet = query({
  args: {},
  handler: async (ctx) => {
    const accountId = await requireAccountId(ctx);
    const wallet = await ctx.db
      .query("buyer_wallets")
      .withIndex("by_buyer", (q) => q.eq("buyer_id", accountId))
      .first();
    return (
      wallet ?? {
        buyer_id: accountId,
        available_credits: 0,
        reserved_credits: 0,
        lifetime_purchased: 0,
        lifetime_granted: 0,
        lifetime_spent: 0,
        updated_at: 0,
      }
    );
  },
});

export const myLedger = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const accountId = await requireAccountId(ctx);
    return await ctx.db
      .query("ledger_entries")
      .withIndex("by_account", (q) =>
        q.eq("account_type", "buyer").eq("account_id", accountId),
      )
      .order("desc")
      .take(args.limit ?? 25);
  },
});

export const ledgerForTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    await assertTaskReadable(ctx, args.task_id);
    const rows = await ctx.db
      .query("ledger_entries")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .collect();
    return rows.sort((a, b) => a.created_at - b.created_at);
  },
});

export const payoutAccountForAgent = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agent_payout_accounts")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .first();
  },
});

export const recordCheckoutSessionCreated = mutation({
  args: {
    server_secret: v.optional(v.string()),
    buyer_id: v.string(),
    session_id: v.string(),
    amount_usd: v.number(),
    credits: v.number(),
    stripe_customer_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requirePaymentServer(args.server_secret);
    const now = Date.now();
    const existing = await ctx.db
      .query("stripe_checkout_sessions")
      .withIndex("by_session", (q) => q.eq("session_id", args.session_id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        buyer_id: args.buyer_id,
        amount_usd: roundMoney(args.amount_usd),
        credits: roundMoney(args.credits),
        status: "created",
        ...(args.stripe_customer_id
          ? { stripe_customer_id: args.stripe_customer_id }
          : {}),
        updated_at: now,
      });
      return { session_id: args.session_id };
    }
    await ctx.db.insert("stripe_checkout_sessions", {
      buyer_id: args.buyer_id,
      session_id: args.session_id,
      amount_usd: roundMoney(args.amount_usd),
      credits: roundMoney(args.credits),
      status: "created",
      ...(args.stripe_customer_id
        ? { stripe_customer_id: args.stripe_customer_id }
        : {}),
      created_at: now,
      updated_at: now,
    });
    return { session_id: args.session_id };
  },
});

export const fulfillCheckoutSession = mutation({
  args: {
    server_secret: v.optional(v.string()),
    buyer_id: v.string(),
    session_id: v.string(),
    amount_usd: v.number(),
    credits: v.number(),
    stripe_event_id: v.string(),
    stripe_customer_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requirePaymentServer(args.server_secret);
    const idempotencyKey = `stripe:${args.stripe_event_id}:credit_purchase`;
    if (await existingLedger(ctx, idempotencyKey)) {
      return { ok: true, idempotent: true };
    }

    const now = Date.now();
    const wallet = await ensureBuyerWallet(ctx, args.buyer_id);
    await ctx.db.patch(wallet._id, {
      available_credits: roundMoney(wallet.available_credits + args.credits),
      lifetime_purchased: roundMoney(wallet.lifetime_purchased + args.credits),
      updated_at: now,
    });

    const session = await ctx.db
      .query("stripe_checkout_sessions")
      .withIndex("by_session", (q) => q.eq("session_id", args.session_id))
      .first();
    if (session) {
      await ctx.db.patch(session._id, {
        status: "completed",
        amount_usd: roundMoney(args.amount_usd),
        credits: roundMoney(args.credits),
        ...(args.stripe_customer_id
          ? { stripe_customer_id: args.stripe_customer_id }
          : {}),
        updated_at: now,
      });
    } else {
      await ctx.db.insert("stripe_checkout_sessions", {
        buyer_id: args.buyer_id,
        session_id: args.session_id,
        amount_usd: roundMoney(args.amount_usd),
        credits: roundMoney(args.credits),
        status: "completed",
        ...(args.stripe_customer_id
          ? { stripe_customer_id: args.stripe_customer_id }
          : {}),
        created_at: now,
        updated_at: now,
      });
    }

    await insertLedger(ctx, {
      account_id: args.buyer_id,
      account_type: "buyer",
      entry_type: "credit_purchase",
      amount: args.credits,
      stripe_event_id: args.stripe_event_id,
      stripe_session_id: args.session_id,
      idempotency_key: idempotencyKey,
    });

    return { ok: true, idempotent: false };
  },
});

export const _grantTrialCreditsIfNeeded = internalMutation({
  args: {
    account_id: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const amount = roundMoney(args.amount);
    if (amount <= 0) throw new Error("trial grant must be positive");
    const idempotencyKey = `trial:${args.account_id}:${amount.toFixed(2)}`;
    if (await existingLedger(ctx, idempotencyKey)) {
      return { granted: false, idempotent: true };
    }

    const wallet = await ensureBuyerWallet(ctx, args.account_id);
    await ctx.db.patch(wallet._id, {
      available_credits: roundMoney(wallet.available_credits + amount),
      lifetime_granted: roundMoney((wallet.lifetime_granted ?? 0) + amount),
      updated_at: Date.now(),
    });
    await insertLedger(ctx, {
      account_id: args.account_id,
      account_type: "buyer",
      entry_type: "trial_credit_grant",
      amount,
      idempotency_key: idempotencyKey,
    });
    return { granted: true, idempotent: false };
  },
});

export const grantTrialCreditsIfNeeded = mutation({
  args: {},
  handler: async (ctx): Promise<{ granted: boolean; idempotent: boolean }> => {
    const accountId = await requireAccountId(ctx);
    const wallet = await ensureBuyerWallet(ctx, accountId);
    const missingTrialCredits = roundMoney(
      FREE_TRIAL_CREDITS - (wallet.lifetime_granted ?? 0),
    );
    if (missingTrialCredits <= 0) {
      return { granted: false, idempotent: true };
    }
    return (await ctx.runMutation(internal.payments._grantTrialCreditsIfNeeded, {
      account_id: accountId,
      amount: missingTrialCredits,
    })) as { granted: boolean; idempotent: boolean };
  },
});

export const updateCheckoutSessionStatus = mutation({
  args: {
    server_secret: v.optional(v.string()),
    session_id: v.string(),
    status: checkoutStatusValidator,
  },
  handler: async (ctx, args) => {
    requirePaymentServer(args.server_secret);
    const session = await ctx.db
      .query("stripe_checkout_sessions")
      .withIndex("by_session", (q) => q.eq("session_id", args.session_id))
      .first();
    if (!session) return { ok: false };
    await ctx.db.patch(session._id, {
      status: args.status,
      updated_at: Date.now(),
    });
    return { ok: true };
  },
});

export const _reserveTaskBudget = internalMutation({
  args: {
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const amount = roundMoney(args.amount);
    if (amount <= 0) throw new Error("task budget must be positive");
    const idempotencyKey = `task:${args.task_id}:reserve`;
    if (await existingLedger(ctx, `${idempotencyKey}:buyer`)) {
      return { ok: true, idempotent: true };
    }

    const wallet = await ensureBuyerWallet(ctx, args.buyer_id);
    if (roundMoney(wallet.available_credits) < amount) {
      throw new Error(
        `insufficient credits: ${amount.toFixed(2)} required, ${wallet.available_credits.toFixed(2)} available`,
      );
    }

    await ctx.db.patch(wallet._id, {
      available_credits: roundMoney(wallet.available_credits - amount),
      reserved_credits: roundMoney(wallet.reserved_credits + amount),
      updated_at: Date.now(),
    });
    await ctx.db.patch(args.task_id, { payment_status: "funds_reserved" });

    await insertLedger(ctx, {
      account_id: args.buyer_id,
      account_type: "buyer",
      entry_type: "credit_reserve",
      amount: -amount,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:buyer`,
    });
    await insertLedger(ctx, {
      account_id: String(args.task_id),
      account_type: "escrow",
      entry_type: "credit_reserve",
      amount,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:escrow`,
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "payment_reserved",
      payload: { buyer_id: args.buyer_id, amount },
    });
    return { ok: true, idempotent: false };
  },
});

export const _allocateChildBudget = internalMutation({
  args: {
    parent_task_id: v.id("tasks"),
    child_task_id: v.id("tasks"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const amount = roundMoney(args.amount);
    if (amount <= 0) return { ok: true, skipped: true };
    const idempotencyKey = `task:${args.child_task_id}:child_budget`;
    if (await existingLedger(ctx, `${idempotencyKey}:child`)) {
      return { ok: true, idempotent: true };
    }
    await insertLedger(ctx, {
      account_id: String(args.parent_task_id),
      account_type: "escrow",
      entry_type: "credit_reserve",
      amount: -amount,
      task_id: args.parent_task_id,
      idempotency_key: `${idempotencyKey}:parent`,
    });
    await insertLedger(ctx, {
      account_id: String(args.child_task_id),
      account_type: "escrow",
      entry_type: "credit_reserve",
      amount,
      task_id: args.child_task_id,
      idempotency_key: `${idempotencyKey}:child`,
    });
    await ctx.db.patch(args.child_task_id, {
      payment_status: "funds_reserved",
    });
    return { ok: true, idempotent: false };
  },
});

export const _lockTaskEscrow = internalMutation({
  args: {
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    seller_id: v.string(),
    price_paid: v.number(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) throw new Error("task not found");
    const pricePaid = roundMoney(args.price_paid);
    const unused = Math.max(0, roundMoney(task.max_budget - pricePaid));
    const idempotencyKey = `task:${args.task_id}:lock`;
    if (await existingLedger(ctx, `${idempotencyKey}:escrow_lock`)) {
      return { ok: true, idempotent: true };
    }

    const wallet = await ensureBuyerWallet(ctx, args.buyer_id);
    if (roundMoney(wallet.reserved_credits) < pricePaid) {
      throw new Error(
        `insufficient reserved credits: ${pricePaid.toFixed(2)} required, ${wallet.reserved_credits.toFixed(2)} reserved`,
      );
    }
    if (unused > 0) {
      await ctx.db.patch(wallet._id, {
        available_credits: roundMoney(wallet.available_credits + unused),
        reserved_credits: roundMoney(wallet.reserved_credits - unused),
        updated_at: Date.now(),
      });
      await insertLedger(ctx, {
        account_id: args.buyer_id,
        account_type: "buyer",
        entry_type: "credit_release",
        amount: unused,
        task_id: args.task_id,
        idempotency_key: `${idempotencyKey}:buyer_unused`,
      });
      await insertLedger(ctx, {
        account_id: String(args.task_id),
        account_type: "escrow",
        entry_type: "credit_release",
        amount: -unused,
        task_id: args.task_id,
        idempotency_key: `${idempotencyKey}:escrow_unused`,
      });
    }

    await insertLedger(ctx, {
      account_id: String(args.task_id),
      account_type: "escrow",
      entry_type: "escrow_release",
      amount: 0,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:escrow_lock`,
    });
    await ctx.db.patch(args.task_id, { payment_status: "escrow_locked" });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "escrow_locked",
      payload: {
        buyer_id: args.buyer_id,
        seller_id: args.seller_id,
        price_paid: pricePaid,
        unused_released: unused,
      },
    });
    return { ok: true, idempotent: false };
  },
});

export const _refundTaskReservation = internalMutation({
  args: {
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    amount: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const amount = roundMoney(args.amount);
    if (amount <= 0) return { ok: true, skipped: true };
    const idempotencyKey = `task:${args.task_id}:reservation_refund`;
    if (await existingLedger(ctx, `${idempotencyKey}:buyer`)) {
      return { ok: true, idempotent: true };
    }
    const wallet = await ensureBuyerWallet(ctx, args.buyer_id);
    const reservedToRelease = Math.min(wallet.reserved_credits, amount);
    await ctx.db.patch(wallet._id, {
      available_credits: roundMoney(wallet.available_credits + reservedToRelease),
      reserved_credits: roundMoney(wallet.reserved_credits - reservedToRelease),
      updated_at: Date.now(),
    });
    await ctx.db.patch(args.task_id, { payment_status: "refunded" });
    await insertLedger(ctx, {
      account_id: args.buyer_id,
      account_type: "buyer",
      entry_type: "credit_refund",
      amount: reservedToRelease,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:buyer`,
    });
    await insertLedger(ctx, {
      account_id: String(args.task_id),
      account_type: "escrow",
      entry_type: "credit_refund",
      amount: -reservedToRelease,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:escrow`,
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "payment_refunded",
      payload: {
        buyer_id: args.buyer_id,
        amount: reservedToRelease,
        reason: args.reason,
      },
    });
    return { ok: true, idempotent: false };
  },
});

export const _refundEscrowToBuyer = internalMutation({
  args: {
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    amount: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const amount = roundMoney(args.amount);
    const idempotencyKey = `task:${args.task_id}:escrow_refund`;
    if (await existingLedger(ctx, `${idempotencyKey}:buyer`)) {
      return { ok: true, idempotent: true };
    }
    const wallet = await ensureBuyerWallet(ctx, args.buyer_id);
    const reservedToRelease = Math.min(wallet.reserved_credits, amount);
    await ctx.db.patch(wallet._id, {
      available_credits: roundMoney(wallet.available_credits + reservedToRelease),
      reserved_credits: roundMoney(wallet.reserved_credits - reservedToRelease),
      updated_at: Date.now(),
    });
    await ctx.db.patch(args.task_id, { payment_status: "refunded" });
    await insertLedger(ctx, {
      account_id: args.buyer_id,
      account_type: "buyer",
      entry_type: "credit_refund",
      amount: reservedToRelease,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:buyer`,
    });
    await insertLedger(ctx, {
      account_id: String(args.task_id),
      account_type: "escrow",
      entry_type: "credit_refund",
      amount: -reservedToRelease,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:escrow`,
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "payment_refunded",
      payload: { buyer_id: args.buyer_id, amount: reservedToRelease, reason: args.reason },
    });
    return { ok: true, idempotent: false };
  },
});

export const _releaseEscrowToAgent = internalMutation({
  args: {
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    seller_id: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const settlement = calculateEscrowSettlement(args.amount);
    const idempotencyKey = `task:${args.task_id}:escrow_release`;
    if (await existingLedger(ctx, `${idempotencyKey}:agent`)) {
      return { ok: true, idempotent: true };
    }
    const buyerWallet = await ensureBuyerWallet(ctx, args.buyer_id);
    const agentWallet = await ensureAgentWallet(ctx, args.seller_id);
    const reservedToSpend = Math.min(buyerWallet.reserved_credits, settlement.gross);

    await ctx.db.patch(buyerWallet._id, {
      reserved_credits: roundMoney(buyerWallet.reserved_credits - reservedToSpend),
      lifetime_spent: roundMoney(buyerWallet.lifetime_spent + settlement.gross),
      updated_at: Date.now(),
    });
    await ctx.db.patch(agentWallet._id, {
      available_earnings: roundMoney(agentWallet.available_earnings + settlement.agentNet),
      lifetime_earned: roundMoney(agentWallet.lifetime_earned + settlement.agentNet),
      updated_at: Date.now(),
    });
    await ctx.db.patch(args.task_id, { payment_status: "released" });
    await insertLedger(ctx, {
      account_id: String(args.task_id),
      account_type: "escrow",
      entry_type: "escrow_release",
      amount: -settlement.gross,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:escrow`,
    });
    await insertLedger(ctx, {
      account_id: args.seller_id,
      account_type: "agent",
      entry_type: "agent_earning_available",
      amount: settlement.agentNet,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:agent`,
    });
    await insertLedger(ctx, {
      account_id: "platform",
      account_type: "platform",
      entry_type: "platform_fee",
      amount: settlement.platformFee,
      task_id: args.task_id,
      idempotency_key: `${idempotencyKey}:platform`,
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "payment_released",
      payload: {
        buyer_id: args.buyer_id,
        seller_id: args.seller_id,
        gross: settlement.gross,
        platform_fee: settlement.platformFee,
        agent_net: settlement.agentNet,
      },
    });
    return { ok: true, idempotent: false };
  },
});

export const upsertPayoutAccount = mutation({
  args: {
    server_secret: v.optional(v.string()),
    agent_id: v.string(),
    stripe_connect_account_id: v.string(),
    onboarding_status: onboardingStatusValidator,
    charges_enabled: v.boolean(),
    payouts_enabled: v.boolean(),
    requirements_due: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    requirePaymentServer(args.server_secret);
    const now = Date.now();
    const existing = await ctx.db
      .query("agent_payout_accounts")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .first();
    const fields = {
      stripe_connect_account_id: args.stripe_connect_account_id,
      onboarding_status: args.onboarding_status,
      charges_enabled: args.charges_enabled,
      payouts_enabled: args.payouts_enabled,
      requirements_due: args.requirements_due,
      last_checked_at: now,
      updated_at: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("agent_payout_accounts", {
        agent_id: args.agent_id,
        ...fields,
      });
    }
    return { ok: true };
  },
});

export const beginPayout = mutation({
  args: {
    server_secret: v.optional(v.string()),
    agent_id: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    requirePaymentServer(args.server_secret);
    const amount = roundMoney(args.amount);
    if (amount <= 0) throw new Error("payout amount must be positive");
    const wallet = await ensureAgentWallet(ctx, args.agent_id);
    if (wallet.available_earnings < amount) {
      throw new Error(
        `insufficient agent earnings: ${amount.toFixed(2)} requested, ${wallet.available_earnings.toFixed(2)} available`,
      );
    }
    const account = await ctx.db
      .query("agent_payout_accounts")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!account || !account.payouts_enabled) {
      throw new Error("agent payout account is not ready");
    }
    const now = Date.now();
    await ctx.db.patch(wallet._id, {
      available_earnings: roundMoney(wallet.available_earnings - amount),
      updated_at: now,
    });
    const payout_id = await ctx.db.insert("payouts", {
      agent_id: args.agent_id,
      amount,
      currency: CREDIT_CURRENCY,
      status: "processing",
      created_at: now,
      updated_at: now,
    });
    return {
      payout_id,
      stripe_connect_account_id: account.stripe_connect_account_id,
      amount,
    };
  },
});

export const markPayoutPaid = mutation({
  args: {
    server_secret: v.optional(v.string()),
    payout_id: v.id("payouts"),
    stripe_transfer_id: v.string(),
  },
  handler: async (ctx, args) => {
    requirePaymentServer(args.server_secret);
    const payout = await ctx.db.get(args.payout_id);
    if (!payout) throw new Error("payout not found");
    if (payout.status === "paid") return { ok: true, idempotent: true };
    const wallet = await ensureAgentWallet(ctx, payout.agent_id);
    await ctx.db.patch(wallet._id, {
      lifetime_paid_out: roundMoney(wallet.lifetime_paid_out + payout.amount),
      updated_at: Date.now(),
    });
    await ctx.db.patch(args.payout_id, {
      status: "paid",
      stripe_transfer_id: args.stripe_transfer_id,
      updated_at: Date.now(),
    });
    await insertLedger(ctx, {
      account_id: payout.agent_id,
      account_type: "agent",
      entry_type: "agent_payout",
      amount: -payout.amount,
      stripe_transfer_id: args.stripe_transfer_id,
      idempotency_key: `payout:${args.payout_id}:paid`,
    });
    return { ok: true, idempotent: false };
  },
});

export const markPayoutFailed = mutation({
  args: {
    server_secret: v.optional(v.string()),
    payout_id: v.id("payouts"),
    failure_reason: v.string(),
  },
  handler: async (ctx, args) => {
    requirePaymentServer(args.server_secret);
    const payout = await ctx.db.get(args.payout_id);
    if (!payout) throw new Error("payout not found");
    if (payout.status === "failed") return { ok: true, idempotent: true };
    const wallet = await ensureAgentWallet(ctx, payout.agent_id);
    await ctx.db.patch(wallet._id, {
      available_earnings: roundMoney(wallet.available_earnings + payout.amount),
      updated_at: Date.now(),
    });
    await ctx.db.patch(args.payout_id, {
      status: "failed",
      failure_reason: args.failure_reason,
      updated_at: Date.now(),
    });
    await insertLedger(ctx, {
      account_id: payout.agent_id,
      account_type: "agent",
      entry_type: "agent_payout_failed",
      amount: payout.amount,
      idempotency_key: `payout:${args.payout_id}:failed`,
    });
    return { ok: true, idempotent: false };
  },
});
