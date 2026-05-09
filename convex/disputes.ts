"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Re-runs the judge with the dispute reason injected. Reputation and escrow
 * effects then flow through the standard settle action.
 */
export const raise = action({
  args: { task_id: v.id("tasks"), reason: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "judge_verdict",
      payload: { dispute_opened: true, reason: args.reason },
    });
    await ctx.scheduler.runAfter(0, internal.auctions.judge, {
      task_id: args.task_id,
      dispute_reason: args.reason,
    });
    return { ok: true };
  },
});
