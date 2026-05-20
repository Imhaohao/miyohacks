/**
 * One-shot data migration: credit-amount fields move from decimal-USD to
 * integer-credit semantics (1 credit = 1 cent of USD). Every amount field
 * across the schema is multiplied by 100.
 *
 * USAGE
 *   1. Deploy this code.
 *   2. Run once from the Convex CLI:
 *
 *        ALLOW_CREDIT_MIGRATION=1 npx convex run migrations:migrateCreditsToCents
 *
 *      The env var gate is a tripwire — there is no built-in "did this
 *      already run" check (Convex doesn't have a migrations table here),
 *      so the operator is responsible for running this exactly once per
 *      deployment.
 *   3. Inspect the returned counts; they should match table row counts.
 *   4. Remove `ALLOW_CREDIT_MIGRATION` from the deployment env afterward.
 *
 * SAFETY
 *   - Runs as a single mutation per table. For Arbor's current scale this
 *     fits comfortably inside Convex's per-transaction write budget.
 *   - If a future deployment exceeds ~3000 rows in any one table this needs
 *     to be paginated; the helpers below are written so that's easy to do.
 *   - There is no automatic rollback. If something looks wrong, restore
 *     from a Convex backup and re-deploy the previous code.
 */

import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const SCALE = 100; // 1 USD == 100 credits

function scale(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  return Math.round(value * SCALE);
}

// --- per-table mutations -------------------------------------------------

export const _scaleTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("tasks").collect()) {
      const patch: Record<string, number | undefined> = {};
      patch.max_budget = Math.round(row.max_budget * SCALE);
      if (row.price_paid !== undefined) {
        patch.price_paid = Math.round(row.price_paid * SCALE);
      }
      await ctx.db.patch(row._id, patch);
      updated += 1;
    }
    return { table: "tasks", updated };
  },
});

export const _scaleBids = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("bids").collect()) {
      const patch: Record<string, number | undefined> = {
        bid_price: Math.round(row.bid_price * SCALE),
      };
      if (row.effective_price !== undefined) {
        patch.effective_price = Math.round(row.effective_price * SCALE);
      }
      await ctx.db.patch(row._id, patch);
      updated += 1;
    }
    return { table: "bids", updated };
  },
});

export const _scaleEscrow = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("escrow").collect()) {
      const patch: Record<string, number | undefined> = {
        locked_amount: Math.round(row.locked_amount * SCALE),
      };
      if (row.platform_fee !== undefined) {
        patch.platform_fee = Math.round(row.platform_fee * SCALE);
      }
      if (row.agent_net_amount !== undefined) {
        patch.agent_net_amount = Math.round(row.agent_net_amount * SCALE);
      }
      await ctx.db.patch(row._id, patch);
      updated += 1;
    }
    return { table: "escrow", updated };
  },
});

export const _scaleBuyerWallets = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("buyer_wallets").collect()) {
      await ctx.db.patch(row._id, {
        available_credits: Math.round(row.available_credits * SCALE),
        reserved_credits: Math.round(row.reserved_credits * SCALE),
        lifetime_purchased: Math.round(row.lifetime_purchased * SCALE),
        lifetime_granted:
          row.lifetime_granted !== undefined
            ? Math.round(row.lifetime_granted * SCALE)
            : undefined,
        lifetime_spent: Math.round(row.lifetime_spent * SCALE),
      });
      updated += 1;
    }
    return { table: "buyer_wallets", updated };
  },
});

export const _scaleAgentWallets = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("agent_wallets").collect()) {
      await ctx.db.patch(row._id, {
        available_earnings: Math.round(row.available_earnings * SCALE),
        pending_earnings: Math.round(row.pending_earnings * SCALE),
        lifetime_earned: Math.round(row.lifetime_earned * SCALE),
        lifetime_paid_out: Math.round(row.lifetime_paid_out * SCALE),
      });
      updated += 1;
    }
    return { table: "agent_wallets", updated };
  },
});

export const _scaleLedgerEntries = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("ledger_entries").collect()) {
      await ctx.db.patch(row._id, {
        amount: Math.round(row.amount * SCALE),
      });
      updated += 1;
    }
    return { table: "ledger_entries", updated };
  },
});

export const _scaleStripeSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    // We deliberately do NOT scale `amount_usd` here — that field is the
    // human-readable dollar receipt and stays in USD. Only `credits` moves.
    let updated = 0;
    for (const row of await ctx.db.query("stripe_checkout_sessions").collect()) {
      await ctx.db.patch(row._id, {
        credits: Math.round(row.credits * SCALE),
      });
      updated += 1;
    }
    return { table: "stripe_checkout_sessions", updated };
  },
});

export const _scaleTaskPayments = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("task_payments").collect()) {
      const patch: Record<string, number | undefined> = {
        gross_funded: Math.round(row.gross_funded * SCALE),
      };
      const optionalFields: Array<
        keyof Pick<
          typeof row,
          | "clearing_price"
          | "refunded_unused"
          | "refunded_total"
          | "agent_net_transferred"
          | "platform_fee"
        >
      > = [
        "clearing_price",
        "refunded_unused",
        "refunded_total",
        "agent_net_transferred",
        "platform_fee",
      ];
      for (const key of optionalFields) {
        const scaled = scale(row[key]);
        if (scaled !== undefined) patch[key] = scaled;
      }
      await ctx.db.patch(row._id, patch);
      updated += 1;
    }
    return { table: "task_payments", updated };
  },
});

export const _scalePayouts = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("payouts").collect()) {
      await ctx.db.patch(row._id, {
        amount: Math.round(row.amount * SCALE),
      });
      updated += 1;
    }
    return { table: "payouts", updated };
  },
});

export const _scaleAgents = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("agents").collect()) {
      await ctx.db.patch(row._id, {
        cost_per_task_estimate: Math.round(row.cost_per_task_estimate * SCALE),
      });
      updated += 1;
    }
    return { table: "agents", updated };
  },
});

export const _scaleReputationDimensions = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("reputation_dimensions").collect()) {
      await ctx.db.patch(row._id, {
        bid_price: Math.round(row.bid_price * SCALE),
        price_paid: Math.round(row.price_paid * SCALE),
      });
      updated += 1;
    }
    return { table: "reputation_dimensions", updated };
  },
});

export const _scaleAgentContacts = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("agent_contacts").collect()) {
      await ctx.db.patch(row._id, {
        cost_baseline: Math.round(row.cost_baseline * SCALE),
      });
      updated += 1;
    }
    return { table: "agent_contacts", updated };
  },
});

export const _scaleDiscoveredSpecialists = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const row of await ctx.db.query("discovered_specialists").collect()) {
      await ctx.db.patch(row._id, {
        cost_baseline: Math.round(row.cost_baseline * SCALE),
      });
      updated += 1;
    }
    return { table: "discovered_specialists", updated };
  },
});

// --- orchestrator action -------------------------------------------------

/**
 * Run all per-table scalings sequentially. Gated by an env var to prevent
 * accidental re-runs.
 */
export const migrateCreditsToCents = internalAction({
  args: {},
  handler: async (ctx) => {
    if (process.env.ALLOW_CREDIT_MIGRATION !== "1") {
      throw new Error(
        "Refusing to run: set ALLOW_CREDIT_MIGRATION=1 on the Convex deployment, " +
          "then call this action exactly once. See convex/migrations.ts for details.",
      );
    }

    const summary: Array<{ table: string; updated: number }> = [];
    const mutations = [
      internal.migrations._scaleTasks,
      internal.migrations._scaleBids,
      internal.migrations._scaleEscrow,
      internal.migrations._scaleBuyerWallets,
      internal.migrations._scaleAgentWallets,
      internal.migrations._scaleLedgerEntries,
      internal.migrations._scaleStripeSessions,
      internal.migrations._scaleTaskPayments,
      internal.migrations._scalePayouts,
      internal.migrations._scaleAgents,
      internal.migrations._scaleReputationDimensions,
      internal.migrations._scaleAgentContacts,
      internal.migrations._scaleDiscoveredSpecialists,
    ] as const;

    for (const mutation of mutations) {
      const result = (await ctx.runMutation(mutation, {})) as {
        table: string;
        updated: number;
      };
      summary.push(result);
    }

    const total = summary.reduce((sum, entry) => sum + entry.updated, 0);
    return { summary, total_rows_updated: total };
  },
});
