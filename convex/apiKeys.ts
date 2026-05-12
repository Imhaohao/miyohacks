import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertProjectOwned, requireAccountId } from "./authHelpers";

function requireServerSecret(secret: string | undefined) {
  const expected = process.env.PAYMENT_SERVER_SECRET;
  if (expected && secret !== expected) {
    throw new Error("invalid server secret");
  }
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const accountId = await requireAccountId(ctx);
    const rows = await ctx.db
      .query("user_api_keys")
      .withIndex("by_account", (q) => q.eq("account_id", accountId))
      .collect();
    return rows
      .sort((a, b) => b.created_at - a.created_at)
      .map(({ token_hash: _tokenHash, ...row }) => row);
  },
});

export const createForAccount = mutation({
  args: {
    server_secret: v.optional(v.string()),
    account_id: v.string(),
    project_id: v.optional(v.id("projects")),
    name: v.string(),
    token_hash: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    if (args.project_id) {
      await assertProjectOwned(ctx, args.project_id, args.account_id);
    }
    const id = await ctx.db.insert("user_api_keys", {
      account_id: args.account_id,
      project_id: args.project_id,
      name: args.name.trim() || "API key",
      token_hash: args.token_hash,
      created_at: Date.now(),
    });
    return { api_key_id: id };
  },
});

export const validate = mutation({
  args: {
    server_secret: v.optional(v.string()),
    token_hash: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    const row = await ctx.db
      .query("user_api_keys")
      .withIndex("by_token_hash", (q) => q.eq("token_hash", args.token_hash))
      .first();
    if (!row || row.revoked_at) return null;
    await ctx.db.patch(row._id, { last_used_at: Date.now() });
    return {
      account_id: row.account_id,
      project_id: row.project_id,
      name: row.name,
    };
  },
});

export const revokeMine = mutation({
  args: { api_key_id: v.id("user_api_keys") },
  handler: async (ctx, args) => {
    const accountId = await requireAccountId(ctx);
    const row = await ctx.db.get(args.api_key_id);
    if (!row || row.account_id !== accountId) throw new Error("API key not found");
    await ctx.db.patch(row._id, { revoked_at: Date.now() });
    return { ok: true };
  },
});
