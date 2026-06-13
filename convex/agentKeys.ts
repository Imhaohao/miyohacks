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

export const _rotate = internalMutation({
  args: {
    agent_id: v.string(),
    secret_b64: v.string(),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = ctx.db
      .query("agent_keys")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id));
    for await (const row of existing) {
      if (row.revoked_at === undefined) {
        await ctx.db.patch(row._id, { revoked_at: args.created_at });
      }
    }
    return await ctx.db.insert("agent_keys", args);
  },
});

export const _getSecretForAgent = internalQuery({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const rows = ctx.db
      .query("agent_keys")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id));
    let latest: { secret_b64: string; created_at: number } | null = null;
    for await (const row of rows) {
      if (row.revoked_at !== undefined) continue;
      if (!latest || row.created_at > latest.created_at) {
        latest = { secret_b64: row.secret_b64, created_at: row.created_at };
      }
    }
    if (!latest) return null;
    return { secret_b64: latest.secret_b64 };
  },
});
