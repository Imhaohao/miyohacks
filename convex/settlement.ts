import { v } from "convex/values";
import { internalAction, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  computePayout,
  currentPeriod,
  periodBounds,
  periodOf,
  type SettledRow,
} from "../lib/hive/settlement-core";

interface AccrualSummary {
  period: string;
  owners: number;
  agents: number;
  gross_volume: number;
}

interface AccrualPairSummary {
  current: AccrualSummary;
  previous: AccrualSummary;
}

const payoutValidator = v.object({
  _id: v.id("payout_records"),
  _creationTime: v.number(),
  owner_id: v.string(),
  agent_id: v.string(),
  period: v.string(),
  tasks_won: v.number(),
  tasks_lost: v.number(),
  tasks_accepted: v.number(),
  gross_volume: v.number(),
  platform_fee: v.number(),
  estimated_payout: v.number(),
  reputation_end: v.number(),
  created_at: v.number(),
  updated_at: v.number(),
});

function platformFeeBps(): number {
  const parsed = Number(process.env.ARBOR_PLATFORM_FEE_BPS ?? "1000");
  return Number.isFinite(parsed) ? parsed : 1000;
}

function previousPeriod(period: string): string {
  const { startMs } = periodBounds(period);
  return periodOf(startMs - 1);
}

async function accruePeriodImpl(
  ctx: any,
  period: string,
): Promise<AccrualSummary> {
  const { startMs, endMs } = periodBounds(period);
  const settled = await ctx.runQuery(
    internal.settlementData._settledTasksInPeriod,
    { start_ms: startMs, end_ms: endMs },
  );

  const rows: SettledRow[] = [];
  for (const row of settled) {
    const owner_id = await ctx.runQuery(internal.settlementData._ownerForAgent, {
      agent_id: row.agent_id,
    });
    rows.push({
      task_id: String(row.task_id),
      agent_id: row.agent_id,
      owner_id,
      status: row.status,
      price_paid: row.price_paid,
    });
  }

  const accruals = computePayout(rows, platformFeeBps());
  for (const accrual of accruals) {
    const agent = await ctx.runQuery(internal.agents._getByAgentId, {
      agent_id: accrual.agent_id,
    });
    await ctx.runMutation(internal.settlementData._upsertPayout, {
      ...accrual,
      period,
      reputation_end: agent?.reputation_score ?? 0,
    });
  }

  return {
    period,
    owners: new Set(accruals.map((row) => row.owner_id)).size,
    agents: accruals.length,
    gross_volume: accruals.reduce((sum, row) => sum + row.gross_volume, 0),
  };
}

export const accruePeriod = internalAction({
  args: { period: v.string() },
  returns: v.object({
    period: v.string(),
    owners: v.number(),
    agents: v.number(),
    gross_volume: v.number(),
  }),
  handler: async (ctx, args): Promise<AccrualSummary> => {
    return await accruePeriodImpl(ctx, args.period);
  },
});

export const accrueCurrentAndPrevious = internalAction({
  args: {},
  returns: v.object({
    current: v.object({
      period: v.string(),
      owners: v.number(),
      agents: v.number(),
      gross_volume: v.number(),
    }),
    previous: v.object({
      period: v.string(),
      owners: v.number(),
      agents: v.number(),
      gross_volume: v.number(),
    }),
  }),
  handler: async (ctx): Promise<AccrualPairSummary> => {
    const current = currentPeriod(Date.now());
    const previous = previousPeriod(current);
    const currentSummary = await accruePeriodImpl(ctx, current);
    const previousSummary = await accruePeriodImpl(ctx, previous);
    return { current: currentSummary, previous: previousSummary };
  },
});

export const payoutsForOwner = query({
  args: { owner_id: v.string(), period: v.optional(v.string()) },
  returns: v.array(payoutValidator),
  handler: async (ctx, args) => {
    const builder = ctx.db.query("payout_records").withIndex(
      "by_owner_and_period",
      (q) =>
        args.period
          ? q.eq("owner_id", args.owner_id).eq("period", args.period)
          : q.eq("owner_id", args.owner_id),
    );
    return await builder.order("desc").take(1000);
  },
});

export const payoutSummary = query({
  args: { period: v.string() },
  returns: v.array(payoutValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("payout_records").take(1000);
    return rows.filter((row) => row.period === args.period);
  },
});
