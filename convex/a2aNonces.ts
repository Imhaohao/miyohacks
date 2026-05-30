import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Nonce store for HMAC-signed inbound A2A callbacks. Each accepted request
 * inserts one row; replays hit the by_nonce index and are rejected. Rows
 * older than the configured retention are dropped by the cleanup mutation.
 */

export const _seenOrInsert = internalMutation({
  args: {
    nonce: v.string(),
    agent_id: v.string(),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("a2a_nonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .first();
    if (existing) return true;
    await ctx.db.insert("a2a_nonces", {
      nonce: args.nonce,
      agent_id: args.agent_id,
      created_at: args.created_at,
    });
    return false;
  },
});

export const _cleanupOlderThan = internalMutation({
  args: { cutoff_ms: v.number() },
  handler: async (ctx, args) => {
    const older = await ctx.db
      .query("a2a_nonces")
      .withIndex("by_created_at", (q) => q.lt("created_at", args.cutoff_ms))
      .collect();
    for (const row of older) await ctx.db.delete(row._id);
    return older.length;
  },
});

export const _findByNonce = internalQuery({
  args: { nonce: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("a2a_nonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .first();
  },
});
