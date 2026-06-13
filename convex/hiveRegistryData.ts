import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export const _getEmbeddingByAgentId = internalQuery({
  args: { agent_id: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("hive_agent_embeddings")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
  },
});

export const _getEmbeddingsByIds = internalQuery({
  args: { ids: v.array(v.id("hive_agent_embeddings")) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const rows = [];
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (row) rows.push(row);
    }
    return rows;
  },
});

export const _upsertEmbedding = internalMutation({
  args: {
    agent_id: v.string(),
    capability_text: v.string(),
    embedding: v.array(v.float64()),
    embedding_model: v.string(),
    eval_passed: v.boolean(),
    cost_baseline: v.number(),
    reputation_score: v.number(),
    updated_at: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("hive_agent_embeddings")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return { id: existing._id, updated: true };
    }
    const id = await ctx.db.insert("hive_agent_embeddings", args);
    return { id, updated: false };
  },
});

export const _hydrateCandidates = internalQuery({
  args: { agent_ids: v.array(v.string()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const out = [];
    for (const agent_id of args.agent_ids) {
      const specialist = await ctx.db
        .query("discovered_specialists")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent_id))
        .first();
      if (!specialist) continue;
      const agent = await ctx.db
        .query("agents")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent_id))
        .first();
      out.push({ specialist, agent });
    }
    return out;
  },
});

export const _setEvalPassed = internalMutation({
  args: { agent_id: v.string(), eval_passed: v.boolean() },
  handler: async (ctx, args) => {
    const embedding = await ctx.db
      .query("hive_agent_embeddings")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!embedding) return { updated: false };
    await ctx.db.patch(embedding._id, {
      eval_passed: args.eval_passed,
      updated_at: Date.now(),
    });
    return { updated: true };
  },
});

export const _setEvalResult = internalMutation({
  args: {
    agent_id: v.string(),
    eval_status: v.union(
      v.literal("pending"),
      v.literal("passed"),
      v.literal("failed"),
    ),
    eval_report: v.any(),
  },
  handler: async (ctx, args) => {
    const specialist = await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!specialist) return { updated: false };
    await ctx.db.patch(specialist._id, {
      eval_status: args.eval_status,
      eval_report: args.eval_report,
    });
    return { updated: true };
  },
});

export const _patchRegistrationMetadata = internalMutation({
  args: {
    agent_id: v.string(),
    owner_id: v.optional(v.string()),
    mcp_tool_schemas: v.optional(v.array(v.any())),
    avg_latency_ms: v.optional(v.number()),
    reliability_score: v.optional(v.number()),
    eval_status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("passed"),
        v.literal("failed"),
      ),
    ),
    eval_report: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const specialist = await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!specialist) return { updated: false };

    const patch: Partial<Doc<"discovered_specialists">> = {};
    if (args.owner_id !== undefined) patch.owner_id = args.owner_id;
    if (args.mcp_tool_schemas !== undefined) {
      patch.mcp_tool_schemas = args.mcp_tool_schemas;
    }
    if (args.avg_latency_ms !== undefined) {
      patch.avg_latency_ms = args.avg_latency_ms;
    }
    if (args.reliability_score !== undefined) {
      patch.reliability_score = args.reliability_score;
    }
    if (args.eval_status !== undefined) patch.eval_status = args.eval_status;
    if (args.eval_report !== undefined) patch.eval_report = args.eval_report;

    await ctx.db.patch(specialist._id, patch);
    return { updated: true };
  },
});
