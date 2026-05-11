import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { qualityAdjustedVickreyPrice } from "../lib/auction-value";

export const chooseTopBid = mutation({
  args: {
    task_id: v.id("tasks"),
    bid_id: v.id("bids"),
    actor: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) throw new Error(`task ${args.task_id} not found`);
    if (task.winning_bid_id) throw new Error("a specialist has already been selected");
    if (task.status !== "awarded") {
      throw new Error("auction is not ready for buyer selection");
    }

    const selected = await ctx.db.get(args.bid_id);
    if (!selected || selected.task_id !== args.task_id) {
      throw new Error("selected bid does not belong to this task");
    }

    const validBids = (
      await ctx.db
        .query("bids")
        .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
        .collect()
    )
      .filter(
        (bid) =>
          bid.bid_price <= task.max_budget &&
          (bid.tool_availability?.status ?? "available") !== "missing",
      )
      .sort((a, b) => (b.value_score ?? b.score) - (a.value_score ?? a.score));

    const top3 = validBids.slice(0, 3);
    if (!top3.some((bid) => bid._id === args.bid_id)) {
      throw new Error("buyer can only choose from the top 3 valid proposals");
    }

    const runner = validBids.find((bid) => bid._id !== selected._id);
    const price_paid = qualityAdjustedVickreyPrice({
      winnerExpectedQuality:
        selected.expected_quality ?? selected.score * selected.bid_price,
      runnerUpValueScore: runner?.value_score ?? runner?.score,
      winnerBidPrice: selected.bid_price,
      maxBudget: task.max_budget,
    });

    await ctx.runMutation(internal.escrow._lock, {
      task_id: args.task_id,
      buyer_id: task.posted_by,
      seller_id: selected.agent_id,
      locked_amount: price_paid,
    });

    await ctx.runMutation(internal.tasks._setWinner, {
      task_id: args.task_id,
      winning_bid_id: selected._id,
      price_paid,
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "auction_choice_selected",
      payload: {
        actor: args.actor,
        bid_id: selected._id,
        agent_id: selected.agent_id,
        price_paid,
        selected_rank: top3.findIndex((bid) => bid._id === selected._id) + 1,
      },
    });

    await ctx.scheduler.runAfter(0, internal.auctions.prepareExecutionPlan, {
      task_id: args.task_id,
    });

    return { bid_id: selected._id, agent_id: selected.agent_id, price_paid };
  },
});
