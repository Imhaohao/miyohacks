import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { qualityAdjustedVickreyPrice } from "../lib/auction-value";
import {
  isSelectableExecutorBid,
  explainUnselectableExecutorBid,
} from "../lib/auction-selection";
import { roleForAgent } from "../lib/agent-roles";
import { actorForCurrentUser, assertTaskReadable } from "./authHelpers";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

function requireServerSecret(secret: string | undefined) {
  const expected = process.env.PAYMENT_SERVER_SECRET?.trim();
  if (!expected) {
    throw new Error("PAYMENT_SERVER_SECRET is required");
  }
  if (secret !== expected) {
    throw new Error("invalid server secret");
  }
}

async function chooseTopBidCore(
  ctx: MutationCtx,
  args: {
    task_id: Id<"tasks">;
    bid_id: Id<"bids">;
    actor: string;
    account_id?: string;
  },
) {
  const task = args.account_id
    ? await ctx.db.get(args.task_id)
    : await assertTaskReadable(ctx, args.task_id);
  if (!task || (args.account_id && task.posted_by !== args.account_id)) {
    throw new Error("task not found");
  }
  const actor = args.actor;
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
        isSelectableExecutorBid(bid, task.max_budget),
    )
    .sort((a, b) => (b.value_score ?? b.score) - (a.value_score ?? a.score));

  const top3 = validBids.slice(0, 3);
  if (!top3.some((bid) => bid._id === args.bid_id)) {
    throw new Error("buyer can only choose from the top 3 executor proposals");
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
      actor,
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
}

async function repairInvalidWinnerCore(
  ctx: MutationCtx,
  args: {
    task_id: Id<"tasks">;
    actor: string;
    account_id?: string;
  },
) {
  const task = args.account_id
    ? await ctx.db.get(args.task_id)
    : await assertTaskReadable(ctx, args.task_id);
  if (!task || (args.account_id && task.posted_by !== args.account_id)) {
    throw new Error("task not found");
  }
  if (task.status !== "awarded") {
    throw new Error("invalid winner repair is only available during awarded review");
  }
  if (!task.winning_bid_id) {
    throw new Error("task has no selected winner to repair");
  }

  const currentWinner = await ctx.db.get(task.winning_bid_id);
  if (currentWinner && isSelectableExecutorBid(currentWinner, task.max_budget)) {
    throw new Error("current winner is already a selectable executor");
  }

  const allBids = await ctx.db
    .query("bids")
    .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
    .collect();
  const validBids = allBids
    .filter((bid) => isSelectableExecutorBid(bid, task.max_budget))
    .sort((a, b) => (b.value_score ?? b.score) - (a.value_score ?? a.score));
  if (validBids.length === 0) {
    throw new Error("no verified external executor bids are available");
  }

  const winner = validBids[0];
  const runnerUp = validBids[1];
  const price_paid = qualityAdjustedVickreyPrice({
    winnerExpectedQuality: winner.expected_quality ?? winner.score * winner.bid_price,
    runnerUpValueScore: runnerUp?.value_score ?? runnerUp?.score,
    winnerBidPrice: winner.bid_price,
    maxBudget: task.max_budget,
  });
  const serializeBid = (b: typeof winner) => ({
    bid_id: b._id,
    agent_id: b.agent_id,
    agent_role: roleForAgent(b.agent_id, b.agent_role),
    bid_price: b.bid_price,
    score: b.value_score ?? b.score,
    value_score: b.value_score ?? b.score,
    capability_claim: b.capability_claim,
    estimated_seconds: b.estimated_seconds,
    task_fit_score: b.task_fit_score,
    historical_quality: b.historical_quality,
    acceptance_rate: b.acceptance_rate,
    reliability_score: b.reliability_score,
    speed_score: b.speed_score,
    estimate_accuracy: b.estimate_accuracy,
    availability_score: b.availability_score,
    expected_quality: b.expected_quality,
    latency_penalty: b.latency_penalty,
    effective_price: b.effective_price,
    execution_preview: b.execution_preview,
    tool_availability: b.tool_availability,
  });

  await ctx.runMutation(internal.tasks._setWinner, {
    task_id: args.task_id,
    winning_bid_id: winner._id,
    price_paid,
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id: args.task_id,
    event_type: "auction_resolved",
    payload: {
      repaired_invalid_winner: true,
      invalid_winner: currentWinner
        ? {
            bid_id: currentWinner._id,
            agent_id: currentWinner.agent_id,
            reason:
              explainUnselectableExecutorBid(currentWinner, task.max_budget) ??
              "not selectable",
          }
        : { bid_id: task.winning_bid_id, reason: "winning bid missing" },
      bids: validBids.map(serializeBid),
      top_3: validBids.slice(0, 3).map(serializeBid),
      support_bids: allBids
        .filter((bid) => !isSelectableExecutorBid(bid, task.max_budget))
        .map(serializeBid),
      winner: serializeBid(winner),
      vickrey: {
        winner_bid_price: winner.bid_price,
        runner_up_value_score: runnerUp?.value_score ?? runnerUp?.score,
        clearing_price: price_paid,
        price_paid,
        rule:
          validBids.length >= 2
            ? "quality_adjusted_second_price"
            : "degenerate_single_bid",
      },
    },
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id: args.task_id,
    event_type: "auction_choice_selected",
    payload: {
      actor: args.actor,
      bid_id: winner._id,
      agent_id: winner.agent_id,
      price_paid,
      repaired_invalid_winner: true,
    },
  });
  await ctx.scheduler.runAfter(0, internal.auctions.prepareExecutionPlan, {
    task_id: args.task_id,
  });
  return { bid_id: winner._id, agent_id: winner.agent_id, price_paid };
}

export const chooseTopBid = mutation({
  args: {
    task_id: v.id("tasks"),
    bid_id: v.id("bids"),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await chooseTopBidCore(ctx, {
      task_id: args.task_id,
      bid_id: args.bid_id,
      actor: args.actor || (await actorForCurrentUser(ctx)),
    });
  },
});

export const chooseTopBidForAccount = mutation({
  args: {
    server_secret: v.optional(v.string()),
    account_id: v.string(),
    task_id: v.id("tasks"),
    bid_id: v.id("bids"),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    return await chooseTopBidCore(ctx, {
      task_id: args.task_id,
      bid_id: args.bid_id,
      actor: args.actor ?? args.account_id,
      account_id: args.account_id,
    });
  },
});

export const repairInvalidWinner = mutation({
  args: {
    task_id: v.id("tasks"),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await repairInvalidWinnerCore(ctx, {
      task_id: args.task_id,
      actor: args.actor || (await actorForCurrentUser(ctx)),
    });
  },
});

export const repairInvalidWinnerForAccount = mutation({
  args: {
    server_secret: v.optional(v.string()),
    account_id: v.string(),
    task_id: v.id("tasks"),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    return await repairInvalidWinnerCore(ctx, {
      task_id: args.task_id,
      actor: args.actor ?? args.account_id,
      account_id: args.account_id,
    });
  },
});
