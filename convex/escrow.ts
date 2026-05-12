import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { calculateAgentNet, calculatePlatformFee } from "../lib/payments";
import { assertTaskReadable } from "./authHelpers";

const escrowStatusValidator = v.union(
  v.literal("locked"),
  v.literal("released"),
  v.literal("refunded"),
);

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    await assertTaskReadable(ctx, args.task_id);
    const row = await ctx.db
      .query("escrow")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .first();
    return row;
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
    const escrowId = await ctx.db.insert("escrow", {
      task_id: args.task_id,
      buyer_id: args.buyer_id,
      seller_id: args.seller_id,
      locked_amount: args.locked_amount,
      platform_fee: calculatePlatformFee(args.locked_amount),
      agent_net_amount: calculateAgentNet(args.locked_amount),
      status: "locked",
    });
    await ctx.runMutation(internal.payments._lockTaskEscrow, {
      task_id: args.task_id,
      buyer_id: args.buyer_id,
      seller_id: args.seller_id,
      price_paid: args.locked_amount,
    });
    return escrowId;
  },
});

export const _settle = internalMutation({
  args: {
    task_id: v.id("tasks"),
    status: escrowStatusValidator,
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("escrow")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .first();
    if (!row) {
      if (args.status === "refunded") {
        const task = await ctx.db.get(args.task_id);
        if (task) {
          await ctx.runMutation(internal.payments._refundTaskReservation, {
            task_id: args.task_id,
            buyer_id: task.posted_by,
            amount: task.max_budget,
            reason: "no escrow row",
          });
        }
      }
      return;
    }
    if (row.status !== "locked") return;
    if (args.status === "released") {
      await ctx.runMutation(internal.payments._releaseEscrowToAgent, {
        task_id: args.task_id,
        buyer_id: row.buyer_id,
        seller_id: row.seller_id,
        amount: row.locked_amount,
      });
    }
    if (args.status === "refunded") {
      await ctx.runMutation(internal.payments._refundEscrowToBuyer, {
        task_id: args.task_id,
        buyer_id: row.buyer_id,
        amount: row.locked_amount,
        reason: "escrow refunded",
      });
    }
    await ctx.db.patch(row._id, { status: args.status });
  },
});
