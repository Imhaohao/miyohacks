import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

function requireAdmin(secret: string | undefined) {
  const expected = process.env.ADMIN_DASHBOARD_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("unauthorized admin request");
  }
}

function countBy<T extends string>(items: T[]) {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
}

function taskSummary(
  task: Doc<"tasks">,
  winningAgentId?: string,
) {
  return {
    _id: task._id,
    posted_by: task.posted_by,
    task_type: task.task_type,
    prompt: task.prompt,
    max_budget: task.max_budget,
    status: task.status,
    payment_status: task.payment_status,
    price_paid: task.price_paid,
    winning_agent_id: winningAgentId,
    judge_verdict: task.judge_verdict,
    created_at: task._creationTime,
  };
}

export const overview = query({
  args: { admin_secret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.admin_secret);
    const [
      tasks,
      bids,
      escrow,
      ledger,
      agentWallets,
      payouts,
      adminEvents,
    ] = await Promise.all([
      ctx.db.query("tasks").collect(),
      ctx.db.query("bids").collect(),
      ctx.db.query("escrow").collect(),
      ctx.db.query("ledger_entries").collect(),
      ctx.db.query("agent_wallets").collect(),
      ctx.db.query("payouts").collect(),
      ctx.db.query("admin_events").collect(),
    ]);
    const bidsById = new Map(bids.map((bid) => [bid._id, bid]));
    const creditsPurchased = ledger
      .filter((entry) => entry.entry_type === "credit_purchase")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const platformFees = ledger
      .filter((entry) => entry.entry_type === "platform_fee")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const escrowLocked = escrow
      .filter((row) => row.status === "locked")
      .reduce((sum, row) => sum + row.locked_amount, 0);
    const agentEarningsAvailable = agentWallets.reduce(
      (sum, wallet) => sum + wallet.available_earnings,
      0,
    );
    const recentFailures = tasks
      .filter((task) => task.status === "failed" || task.status === "disputed")
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 12)
      .map((task) =>
        taskSummary(
          task,
          task.winning_bid_id
            ? bidsById.get(task.winning_bid_id)?.agent_id
            : undefined,
        ),
      );
    return {
      generated_at: Date.now(),
      totals: {
        tasks: tasks.length,
        failed_tasks: tasks.filter((task) => task.status === "failed").length,
        disputed_tasks: tasks.filter((task) => task.status === "disputed").length,
        completed_tasks: tasks.filter((task) => task.status === "complete").length,
        credits_purchased: Number(creditsPurchased.toFixed(2)),
        escrow_locked: Number(escrowLocked.toFixed(2)),
        agent_earnings_available: Number(agentEarningsAvailable.toFixed(2)),
        platform_fees: Number(platformFees.toFixed(2)),
        pending_payouts: payouts.filter((payout) => payout.status === "processing").length,
        failed_payouts: payouts.filter((payout) => payout.status === "failed").length,
      },
      task_counts: countBy(tasks.map((task) => task.status)),
      payment_counts: countBy(
        tasks.map((task) => task.payment_status ?? "unfunded"),
      ),
      recent_failures: recentFailures,
      recent_admin_events: adminEvents
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 20),
    };
  },
});

export const tasks = query({
  args: {
    admin_secret: v.string(),
    status: v.optional(v.string()),
    payment_status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.admin_secret);
    const [tasks, bids] = await Promise.all([
      ctx.db.query("tasks").collect(),
      ctx.db.query("bids").collect(),
    ]);
    const bidsById = new Map(bids.map((bid) => [bid._id, bid]));
    return {
      tasks: tasks
        .filter((task) => !args.status || task.status === args.status)
        .filter(
          (task) =>
            !args.payment_status ||
            (task.payment_status ?? "unfunded") === args.payment_status,
        )
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, Math.min(args.limit ?? 100, 250))
        .map((task) =>
          taskSummary(
            task,
            task.winning_bid_id
              ? bidsById.get(task.winning_bid_id)?.agent_id
              : undefined,
          ),
        ),
    };
  },
});

export const payments = query({
  args: { admin_secret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.admin_secret);
    const [
      buyerWallets,
      agentWallets,
      escrow,
      checkoutSessions,
      payoutAccounts,
      payouts,
      ledgerEntries,
    ] = await Promise.all([
      ctx.db.query("buyer_wallets").collect(),
      ctx.db.query("agent_wallets").collect(),
      ctx.db.query("escrow").collect(),
      ctx.db.query("stripe_checkout_sessions").collect(),
      ctx.db.query("agent_payout_accounts").collect(),
      ctx.db.query("payouts").collect(),
      ctx.db.query("ledger_entries").collect(),
    ]);
    return {
      buyer_wallets: buyerWallets.sort((a, b) => b.updated_at - a.updated_at),
      agent_wallets: agentWallets.sort((a, b) => b.updated_at - a.updated_at),
      escrow: escrow.sort((a, b) => b._creationTime - a._creationTime).slice(0, 100),
      checkout_sessions: checkoutSessions
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 100),
      payout_accounts: payoutAccounts.sort((a, b) => b.updated_at - a.updated_at),
      payouts: payouts.sort((a, b) => b.updated_at - a.updated_at).slice(0, 100),
      ledger_entries: ledgerEntries
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 150),
    };
  },
});

export const agents = query({
  args: { admin_secret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.admin_secret);
    const [agents, contacts, wallets, payoutAccounts] = await Promise.all([
      ctx.db.query("agents").collect(),
      ctx.db.query("agent_contacts").collect(),
      ctx.db.query("agent_wallets").collect(),
      ctx.db.query("agent_payout_accounts").collect(),
    ]);
    const contactsById = new Map(contacts.map((contact) => [contact.agent_id, contact]));
    const walletsById = new Map(wallets.map((wallet) => [wallet.agent_id, wallet]));
    const payoutById = new Map(
      payoutAccounts.map((account) => [account.agent_id, account]),
    );
    return {
      agents: agents
        .map((agent) => {
          const contact = contactsById.get(agent.agent_id);
          const wallet = walletsById.get(agent.agent_id);
          const payout = payoutById.get(agent.agent_id);
          return {
            agent_id: agent.agent_id,
            display_name: agent.display_name,
            sponsor: agent.sponsor,
            industry: contact?.industry,
            protocol: contact?.protocol,
            health_status: contact?.health_status,
            verification_status: contact?.verification_status,
            reputation_score: agent.reputation_score,
            total_tasks_completed: agent.total_tasks_completed,
            total_disputes_lost: agent.total_disputes_lost,
            available_earnings: wallet?.available_earnings ?? 0,
            payouts_enabled: payout?.payouts_enabled ?? false,
            requirements_due: payout?.requirements_due ?? [],
          };
        })
        .sort((a, b) => b.reputation_score - a.reputation_score),
    };
  },
});

async function insertAdminEvent(
  ctx: Pick<MutationCtx, "db">,
  args: {
    actor: string;
    action: string;
    target_type: string;
    target_id: string;
    reason: string;
    payload: unknown;
  },
) {
  return await ctx.db.insert("admin_events", {
    actor: args.actor,
    action: args.action,
    target_type: args.target_type,
    target_id: args.target_id,
    reason: args.reason,
    payload: args.payload,
    created_at: Date.now(),
  });
}

export const _logEvent = internalMutation({
  args: {
    actor: v.string(),
    action: v.string(),
    target_type: v.string(),
    target_id: v.string(),
    reason: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<Id<"admin_events">> => {
    return await insertAdminEvent(ctx, args);
  },
});

export const logEvent = mutation({
  args: {
    admin_secret: v.string(),
    actor: v.string(),
    action: v.string(),
    target_type: v.string(),
    target_id: v.string(),
    reason: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<Id<"admin_events">> => {
    requireAdmin(args.admin_secret);
    return await insertAdminEvent(ctx, args);
  },
});

export const _payoutRetryContext = internalQuery({
  args: { payout_id: v.id("payouts") },
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payout_id);
    if (!payout) return null;
    const account = await ctx.db
      .query("agent_payout_accounts")
      .withIndex("by_agent", (q) => q.eq("agent_id", payout.agent_id))
      .first();
    return { payout, account };
  },
});

export const cancelTask = action({
  args: {
    admin_secret: v.string(),
    actor: v.string(),
    task_id: v.id("tasks"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    requireAdmin(args.admin_secret);
    await ctx.runMutation(internal.admin._logEvent, {
      actor: args.actor,
      action: "cancel_task",
      target_type: "task",
      target_id: args.task_id,
      reason: args.reason,
      payload: {},
    });
    return await ctx.runMutation(api.executionPlans.cancel, {
      task_id: args.task_id,
      reason: args.reason,
      actor: args.actor,
    });
  },
});

export const overrideJudge = action({
  args: {
    admin_secret: v.string(),
    actor: v.string(),
    task_id: v.id("tasks"),
    verdict: v.union(v.literal("accept"), v.literal("reject")),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; verdict: "accept" | "reject" }> => {
    requireAdmin(args.admin_secret);
    await ctx.runMutation(internal.admin._logEvent, {
      actor: args.actor,
      action: "override_judge",
      target_type: "task",
      target_id: args.task_id,
      reason: args.reason,
      payload: { verdict: args.verdict },
    });
    return await ctx.runAction(api.disputes.override, {
      task_id: args.task_id,
      verdict: args.verdict,
      reason: args.reason,
      actor: args.actor,
    });
  },
});

export const retryPayout = action({
  args: {
    admin_secret: v.string(),
    actor: v.string(),
    payout_id: v.id("payouts"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    retry_ready: boolean;
    agent_id: string;
    amount: number;
    message: string;
  }> => {
    requireAdmin(args.admin_secret);
    const retryContext = await ctx.runQuery(internal.admin._payoutRetryContext, {
      payout_id: args.payout_id,
    });
    if (!retryContext) throw new Error("payout not found");
    const { payout, account } = retryContext;
    if (payout.status !== "failed") {
      throw new Error("only failed payouts can be retried from admin");
    }
    if (!account?.payouts_enabled) {
      throw new Error("agent payout account is not ready");
    }
    await ctx.runMutation(internal.admin._logEvent, {
      actor: args.actor,
      action: "retry_payout",
      target_type: "payout",
      target_id: args.payout_id,
      reason: args.reason,
      payload: { agent_id: payout.agent_id, amount: payout.amount },
    });
    return {
      ok: true,
      retry_ready: true,
      agent_id: payout.agent_id,
      amount: payout.amount,
      message:
        "Payout is ready for retry through the Stripe payout route. No transfer was created by Convex.",
    };
  },
});
