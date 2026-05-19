// Convex storage for acceptance-harness snapshots. The CLI script writes via
// `writeSnapshot`; the admin dashboard reads via `latestSnapshot`. Snapshot
// payloads are stored as `v.any()` so the harness output shape can evolve
// without a Convex schema migration — the dashboard widens carefully when
// reading.

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const READINESS = v.union(
  v.literal("ready"),
  v.literal("blocked"),
  v.literal("needs_fix"),
  v.literal("untested"),
);

function requireAdmin(secret: string | undefined) {
  const expected = process.env.ADMIN_DASHBOARD_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("unauthorized admin request");
  }
}

const RECORD_VALIDATOR = v.object({
  agent_id: v.string(),
  display_name: v.string(),
  sponsor: v.string(),
  readiness: READINESS,
  in_domain: v.any(),
  out_of_domain: v.any(),
  notes: v.optional(v.string()),
});

const SUMMARY_VALIDATOR = v.object({
  total: v.number(),
  ready: v.number(),
  blocked: v.number(),
  needs_fix: v.number(),
  untested: v.number(),
});

export const writeSnapshot = mutation({
  args: {
    admin_secret: v.string(),
    run_id: v.string(),
    generated_at: v.number(),
    judge_mode: v.union(v.literal("rubric"), v.literal("llm")),
    summary: SUMMARY_VALIDATOR,
    agents: v.array(RECORD_VALIDATOR),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.admin_secret);

    // Replace any prior rows for this run_id (idempotent writes).
    const priorAgents = await ctx.db
      .query("acceptance_snapshots")
      .withIndex("by_run", (q) => q.eq("run_id", args.run_id))
      .collect();
    for (const row of priorAgents) await ctx.db.delete(row._id);
    const priorRuns = await ctx.db
      .query("acceptance_runs")
      .withIndex("by_run", (q) => q.eq("run_id", args.run_id))
      .collect();
    for (const row of priorRuns) await ctx.db.delete(row._id);

    await ctx.db.insert("acceptance_runs", {
      run_id: args.run_id,
      generated_at: args.generated_at,
      judge_mode: args.judge_mode,
      summary: args.summary,
    });
    for (const agent of args.agents) {
      await ctx.db.insert("acceptance_snapshots", {
        run_id: args.run_id,
        generated_at: args.generated_at,
        judge_mode: args.judge_mode,
        agent_id: agent.agent_id,
        display_name: agent.display_name,
        sponsor: agent.sponsor,
        readiness: agent.readiness,
        in_domain: agent.in_domain,
        out_of_domain: agent.out_of_domain,
        notes: agent.notes,
      });
    }

    return { run_id: args.run_id, count: args.agents.length };
  },
});

export const latestSnapshot = query({
  args: { admin_secret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.admin_secret);
    const runs = await ctx.db.query("acceptance_runs").collect();
    if (runs.length === 0) return null;
    const latest = runs.sort((a, b) => b.generated_at - a.generated_at)[0];
    const agents = await ctx.db
      .query("acceptance_snapshots")
      .withIndex("by_run", (q) => q.eq("run_id", latest.run_id))
      .collect();
    return {
      run_id: latest.run_id,
      generated_at: latest.generated_at,
      judge_mode: latest.judge_mode,
      summary: latest.summary,
      agents: agents.sort((a, b) => a.agent_id.localeCompare(b.agent_id)),
    };
  },
});

/**
 * Pure release-gate computation: a snapshot is shippable iff no agent is in
 * `needs_fix` and no agent is `untested`. `blocked` agents are acceptable
 * because they decline cleanly until configured.
 */
export const releaseGateFromLatest = query({
  args: { admin_secret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.admin_secret);
    const runs = await ctx.db.query("acceptance_runs").collect();
    if (runs.length === 0) {
      return { ok: false, reason: "No acceptance snapshot has been written yet.", blockers: [] };
    }
    const latest = runs.sort((a, b) => b.generated_at - a.generated_at)[0];
    const agents = await ctx.db
      .query("acceptance_snapshots")
      .withIndex("by_run", (q) => q.eq("run_id", latest.run_id))
      .collect();
    const blockers = agents
      .filter((a) => a.readiness === "needs_fix" || a.readiness === "untested")
      .map((a) => ({
        agent_id: a.agent_id,
        readiness: a.readiness,
        reason:
          (a.in_domain && typeof a.in_domain === "object" && "reason" in a.in_domain
            ? String((a.in_domain as { reason?: unknown }).reason ?? "")
            : "") || a.notes || "",
      }));
    if (blockers.length === 0) {
      return {
        ok: true,
        reason: `All ${latest.summary.total} agents are either ready (${latest.summary.ready}) or honestly blocked (${latest.summary.blocked}).`,
        blockers: [],
      };
    }
    return {
      ok: false,
      reason: `${blockers.length} agent(s) need fixes before release.`,
      blockers,
    };
  },
});

export const _purgeAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const a = await ctx.db.query("acceptance_snapshots").collect();
    for (const row of a) await ctx.db.delete(row._id);
    const r = await ctx.db.query("acceptance_runs").collect();
    for (const row of r) await ctx.db.delete(row._id);
  },
});
