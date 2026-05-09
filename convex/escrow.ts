import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

const escrowStatusValidator = v.union(
  v.literal("locked"),
  v.literal("released"),
  v.literal("refunded"),
);

export const forTask = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
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
    return await ctx.db.insert("escrow", {
      task_id: args.task_id,
      buyer_id: args.buyer_id,
      seller_id: args.seller_id,
      locked_amount: args.locked_amount,
      status: "locked",
    });
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
    if (!row) return;
    await ctx.db.patch(row._id, { status: args.status });
  },
});
