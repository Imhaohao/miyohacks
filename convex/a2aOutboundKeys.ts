import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Outbound API keys for remote A2A specialists.
 *
 * The discovered-specialist record stores only an env-var NAME
 * (a2a_api_key_env); this table stores actual key VALUES so keys can be
 * attached at runtime (console paste or auto-acquisition) without redeploys.
 * Auth resolution hydrates process.env[a2a_api_key_env] from here when the
 * env var itself is unset — see app/api/admin/a2a-chat and auctions.solicitBids.
 */

export const setKey = mutation({
  args: {
    agent_id: v.string(),
    api_key: v.string(),
    header_name: v.optional(v.string()),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.api_key.trim()) throw new Error("api_key must be non-empty");
    const now = Date.now();
    const existing = await ctx.db
      .query("a2a_outbound_keys")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        api_key: args.api_key.trim(),
        header_name: args.header_name,
        source: args.source,
        updated_at: now,
      });
      return { agent_id: args.agent_id, updated: true };
    }
    await ctx.db.insert("a2a_outbound_keys", {
      agent_id: args.agent_id,
      api_key: args.api_key.trim(),
      header_name: args.header_name,
      source: args.source,
      created_at: now,
      updated_at: now,
    });
    return { agent_id: args.agent_id, updated: false };
  },
});

export const removeKey = mutation({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("a2a_outbound_keys")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { removed: !!existing };
  },
});

/** Masked listing for UI — never returns the key material. */
export const listMasked = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("a2a_outbound_keys").collect();
    return rows.map((r) => ({
      agent_id: r.agent_id,
      key_preview: `${r.api_key.slice(0, 4)}…(${r.api_key.length} chars)`,
      header_name: r.header_name,
      source: r.source,
      updated_at: r.updated_at,
    }));
  },
});

/** Full key rows — internal only, for auth hydration in actions. */
export const _getAll = internalQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db.query("a2a_outbound_keys").collect();
  },
});

/**
 * Public single-agent lookup used by the Next.js admin chat route, which
 * talks to Convex over ConvexHttpClient and cannot call internal queries.
 * Acceptable here: the admin console itself is the trusted dev surface, and
 * the row only unlocks calling a remote agent the deployment already lists.
 */
export const getForAgent = query({
  args: { agent_id: v.string() },
  returns: v.union(
    v.object({
      agent_id: v.string(),
      api_key: v.string(),
      header_name: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("a2a_outbound_keys")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!row) return null;
    return {
      agent_id: row.agent_id,
      api_key: row.api_key,
      header_name: row.header_name,
    };
  },
});
