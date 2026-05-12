import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertProjectOwned, requireAccountId } from "./authHelpers";

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const accountId = await requireAccountId(ctx);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("owner_account_id", accountId))
      .collect();
    return projects.sort((a, b) => a.created_at - b.created_at);
  },
});

export const getMine = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const accountId = await requireAccountId(ctx);
    return await assertProjectOwned(ctx, args.project_id, accountId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    product_url: v.optional(v.string()),
    github_repo_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const accountId = await requireAccountId(ctx);
    const now = Date.now();
    const name = args.name.trim();
    if (!name) throw new Error("project name is required");
    const project_id = await ctx.db.insert("projects", {
      owner_account_id: accountId,
      name,
      product_url: cleanOptional(args.product_url),
      github_repo_url: cleanOptional(args.github_repo_url),
      created_at: now,
      updated_at: now,
    });
    return { project_id };
  },
});
