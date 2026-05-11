import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

const WEIGHT = {
  quality: 0.45,
  speed: 0.2,
  estimate: 0.15,
  value: 0.2,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Speed: 1.0 if actual ≤ estimated; degrades linearly toward 0 as actual
 * grows to 3× estimated. Beyond that, 0.
 */
function computeSpeedScore(actual: number, estimated: number): number {
  if (estimated <= 0) return 0.5;
  if (actual <= estimated) return 1;
  const overrun = (actual - estimated) / estimated;
  return clamp01(1 - overrun / 2);
}

/**
 * Estimate accuracy: penalizes both over- and under-prediction symmetrically.
 * 1.0 when actual === estimated, falls toward 0 as the ratio diverges.
 */
function computeEstimateAccuracy(actual: number, estimated: number): number {
  if (estimated <= 0) return 0;
  const ratio = actual / estimated;
  // log-symmetric distance — ratio of 1 → 0; ratio of 2 or 0.5 → ~0.7 distance.
  const logDistance = Math.abs(Math.log2(Math.max(0.01, ratio)));
  return clamp01(1 - logDistance / 2);
}

/**
 * Value: quality / price, scaled so that quality 1.0 at $0.50 maps to ~0.8,
 * and quality 1.0 at $0.10 saturates at 1.0. Cheap, high-quality work wins.
 */
function computeValueScore(quality: number, pricePaid: number): number {
  if (pricePaid <= 0) return quality;
  // 0.40 / pricePaid because at $0.40 you get quality * 1.0; at $0.80 you
  // get quality * 0.5; at $0.20 you get quality * 2.0 (clamped to 1).
  const efficiency = 0.4 / pricePaid;
  return clamp01(quality * efficiency);
}

export const _record = internalMutation({
  args: {
    agent_id: v.string(),
    task_id: v.id("tasks"),
    actual_seconds: v.number(),
    estimated_seconds: v.number(),
    quality_score: v.number(),
    accepted: v.boolean(),
    bid_price: v.number(),
    price_paid: v.number(),
  },
  handler: async (ctx, args) => {
    const speed = computeSpeedScore(args.actual_seconds, args.estimated_seconds);
    const estimate = computeEstimateAccuracy(
      args.actual_seconds,
      args.estimated_seconds,
    );
    const quality = clamp01(args.quality_score);
    const value = computeValueScore(quality, args.price_paid);
    const overall = clamp01(
      WEIGHT.quality * quality +
        WEIGHT.speed * speed +
        WEIGHT.estimate * estimate +
        WEIGHT.value * value,
    );

    await ctx.db.insert("reputation_dimensions", {
      agent_id: args.agent_id,
      task_id: args.task_id,
      actual_seconds: args.actual_seconds,
      estimated_seconds: args.estimated_seconds,
      speed_score: speed,
      estimate_accuracy: estimate,
      quality_score: quality,
      value_score: value,
      overall,
      accepted: args.accepted,
      bid_price: args.bid_price,
      price_paid: args.price_paid,
      created_at: Date.now(),
    });

    return { speed, estimate, quality, value, overall };
  },
});

export const forAgent = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reputation_dimensions")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .collect();
    return rows.sort((a, b) => b.created_at - a.created_at);
  },
});

export const _summaryForAgent = internalQuery({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reputation_dimensions")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .collect();

    if (rows.length === 0) {
      return {
        agent_id: args.agent_id,
        tasks: 0,
        speed: 0.65,
        estimate: 0.65,
        quality: 0.65,
        value: 0.65,
        overall: 0.65,
        acceptance_rate: 0.65,
      };
    }

    const totals = rows.reduce(
      (acc, r) => {
        acc.speed += r.speed_score;
        acc.estimate += r.estimate_accuracy;
        acc.quality += r.quality_score;
        acc.value += r.value_score;
        acc.overall += r.overall;
        acc.accepted += r.accepted ? 1 : 0;
        return acc;
      },
      { speed: 0, estimate: 0, quality: 0, value: 0, overall: 0, accepted: 0 },
    );

    return {
      agent_id: args.agent_id,
      tasks: rows.length,
      speed: totals.speed / rows.length,
      estimate: totals.estimate / rows.length,
      quality: totals.quality / rows.length,
      value: totals.value / rows.length,
      overall: totals.overall / rows.length,
      acceptance_rate: totals.accepted / rows.length,
    };
  },
});

export const summaries = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("reputation_dimensions").collect();
    const byAgent = new Map<
      string,
      {
        agent_id: string;
        tasks: number;
        speed: number;
        estimate: number;
        quality: number;
        value: number;
        overall: number;
      }
    >();
    for (const r of rows) {
      const cur = byAgent.get(r.agent_id) ?? {
        agent_id: r.agent_id,
        tasks: 0,
        speed: 0,
        estimate: 0,
        quality: 0,
        value: 0,
        overall: 0,
      };
      cur.tasks += 1;
      cur.speed += r.speed_score;
      cur.estimate += r.estimate_accuracy;
      cur.quality += r.quality_score;
      cur.value += r.value_score;
      cur.overall += r.overall;
      byAgent.set(r.agent_id, cur);
    }
    return Array.from(byAgent.values()).map((s) => ({
      agent_id: s.agent_id,
      tasks: s.tasks,
      speed: s.speed / s.tasks,
      estimate: s.estimate / s.tasks,
      quality: s.quality / s.tasks,
      value: s.value / s.tasks,
      overall: s.overall / s.tasks,
    }));
  },
});
