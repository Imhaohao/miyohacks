import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const settledStatusValidator = v.union(
  v.literal("complete"),
  v.literal("disputed"),
);

const settledRowValidator = v.object({
  task_id: v.id("tasks"),
  agent_id: v.string(),
  status: settledStatusValidator,
  price_paid: v.number(),
});

const PAYOUT_SCAN_LIMIT = 2000;

export const _settledTasksInPeriod = internalQuery({
  args: { start_ms: v.number(), end_ms: v.number() },
  returns: v.array(settledRowValidator),
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query("tasks").order("desc").take(PAYOUT_SCAN_LIMIT);
    if (tasks.length === PAYOUT_SCAN_LIMIT) {
      console.warn(
        `[settlement] scanned ${PAYOUT_SCAN_LIMIT} newest tasks; older period rows may be omitted`,
      );
    }

    const rows: Array<{
      task_id: Id<"tasks">;
      agent_id: string;
      status: "complete" | "disputed";
      price_paid: number;
    }> = [];

    for (const task of tasks) {
      if (task._creationTime < args.start_ms) break;
      if (task._creationTime >= args.end_ms) continue;
      if (task.status !== "complete" && task.status !== "disputed") continue;
      if (!task.winning_bid_id) continue;

      const bid = await ctx.db.get(task.winning_bid_id);
      if (!bid) continue;

      rows.push({
        task_id: task._id,
        agent_id: bid.agent_id,
        status: task.status,
        price_paid: task.price_paid ?? bid.bid_price,
      });
    }

    return rows;
  },
});

export const _ownerForAgent = internalQuery({
  args: { agent_id: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const specialist = await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (specialist?.owner_id) return specialist.owner_id;

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    return agent?.sponsor ?? args.agent_id;
  },
});

export const _upsertPayout = internalMutation({
  args: {
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
  },
  returns: v.id("payout_records"),
  handler: async (ctx, args): Promise<Id<"payout_records">> => {
    const existing = (
      await ctx.db
        .query("payout_records")
        .withIndex("by_owner_and_period", (q) =>
          q.eq("owner_id", args.owner_id).eq("period", args.period),
        )
        .collect()
    ).find((row: Doc<"payout_records">) => row.agent_id === args.agent_id);

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        tasks_won: args.tasks_won,
        tasks_lost: args.tasks_lost,
        tasks_accepted: args.tasks_accepted,
        gross_volume: args.gross_volume,
        platform_fee: args.platform_fee,
        estimated_payout: args.estimated_payout,
        reputation_end: args.reputation_end,
        updated_at: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("payout_records", {
      ...args,
      created_at: now,
      updated_at: now,
    });
  },
});
