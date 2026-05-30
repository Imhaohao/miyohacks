import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Per-agent HMAC shared secrets. Secrets are stored base64-encoded so
 * operators can paste them into env vars without escaping. _getSecretForAgent
 * skips revoked rows.
 */

export const _insert = internalMutation({
  args: {
    agent_id: v.string(),
    secret_b64: v.string(),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agent_keys", args);
  },
});

export const _revoke = internalMutation({
  args: {
    agent_id: v.string(),
    revoked_at: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agent_keys")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!row) return { ok: false };
    await ctx.db.patch(row._id, { revoked_at: args.revoked_at });
    return { ok: true };
  },
});

export const _getSecretForAgent = internalQuery({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agent_keys")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!row || row.revoked_at !== undefined) return null;
    return { secret_b64: row.secret_b64 };
  },
});
