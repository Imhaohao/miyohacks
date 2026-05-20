"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { JudgeVerdict } from "../lib/types";

const HUMAN_OVERRIDE_GOVERNANCE = {
  source: "human_override",
  affects_reputation: false,
  reputation_authority: "canonical_judge_only",
  settlement_authority: "human_governance_override",
} as const;

/**
 * Re-runs the judge with the dispute reason injected. Reputation and escrow
 * effects then flow through the standard settle action.
 */
export const raise = action({
  args: { task_id: v.id("tasks"), reason: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "dispute_raised",
      payload: {
        reason: args.reason,
        next_step: "rerun_canonical_judge",
        reputation_authority: "llm_judge",
      },
    });
    await ctx.scheduler.runAfter(0, internal.auctions.judge, {
      task_id: args.task_id,
      dispute_reason: args.reason,
    });
    return { ok: true };
  },
});

/**
 * Human override: unlike `raise`, this does not ask the model judge again.
 * It records an auditable buyer/operator decision and updates escrow/status,
 * but it does not mutate canonical judge-derived reputation.
 */
export const override = action({
  args: {
    task_id: v.id("tasks"),
    verdict: v.union(v.literal("accept"), v.literal("reject")),
    reason: v.string(),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    if (!task.result) throw new Error("cannot override before execution result");

    const overrideVerdict: JudgeVerdict = {
      verdict: args.verdict,
      reasoning: `Human override by ${args.actor ?? "buyer"}: ${args.reason}`,
      quality_score:
        args.verdict === "accept"
          ? Math.max(0.7, task.judge_verdict?.quality_score ?? 0.8)
          : Math.min(0.3, task.judge_verdict?.quality_score ?? 0.2),
      ...HUMAN_OVERRIDE_GOVERNANCE,
    };

    await ctx.runMutation(internal.tasks._setVerdict, {
      task_id: args.task_id,
      verdict: {
        ...overrideVerdict,
        override: true,
        original_verdict: task.judge_verdict ?? null,
        override_actor: args.actor ?? "buyer",
        override_reason: args.reason,
      },
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "judge_override",
      payload: {
        actor: args.actor ?? "buyer",
        verdict: args.verdict,
        reason: args.reason,
        original_verdict: task.judge_verdict ?? null,
        ...HUMAN_OVERRIDE_GOVERNANCE,
      },
    });

    if (!task.winning_bid_id) {
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: args.verdict === "accept" ? "complete" : "disputed",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "settled",
        payload: {
          override: true,
          verdict: args.verdict,
          synthesized: true,
          quality_score: overrideVerdict.quality_score,
          reason: args.reason,
          ...HUMAN_OVERRIDE_GOVERNANCE,
        },
      });
      return { ok: true, verdict: args.verdict };
    }

    const winner = await ctx.runQuery(internal.bids._get, {
      bid_id: task.winning_bid_id,
    });
    const agent = await ctx.runQuery(internal.agents._getByAgentId, {
      agent_id: winner.agent_id,
    });

    if (args.verdict === "accept") {
      await ctx.runMutation(internal.escrow._settle, {
        task_id: args.task_id,
        status: "released",
      });
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "complete",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "settled",
        payload: {
          override: true,
          verdict: "accept",
          escrow: "released",
          seller_id: winner.agent_id,
          delta: 0,
          new_score: agent?.reputation_score ?? 0,
          price_paid: task.price_paid,
          reason: args.reason,
          ...HUMAN_OVERRIDE_GOVERNANCE,
        },
      });
    } else {
      await ctx.runMutation(internal.escrow._settle, {
        task_id: args.task_id,
        status: "refunded",
      });
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "disputed",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "settled",
        payload: {
          override: true,
          verdict: "reject",
          escrow: "refunded",
          seller_id: winner.agent_id,
          delta: 0,
          new_score: agent?.reputation_score ?? 0,
          price_paid: task.price_paid,
          reason: args.reason,
          ...HUMAN_OVERRIDE_GOVERNANCE,
        },
      });
    }

    return { ok: true, verdict: args.verdict };
  },
});
