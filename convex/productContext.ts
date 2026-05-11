import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const profileArgs = {
  owner_id: v.string(),
  company_name: v.string(),
  product_url: v.optional(v.string()),
  github_repo_url: v.optional(v.string()),
  business_context: v.string(),
  repo_context: v.optional(v.string()),
  source_hints: v.optional(v.array(v.string())),
};

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanList(values: string[] | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}

export const latest = query({
  args: { owner_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("product_context_profiles")
      .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id))
      .order("desc")
      .first();
  },
});

export const readiness = query({
  args: { owner_id: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("product_context_profiles")
      .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id))
      .order("desc")
      .first();

    const hasBusinessContext = Boolean(
      profile?.company_name.trim() && profile?.business_context.trim(),
    );
    const hasRepoContext = Boolean(
      profile?.github_repo_url?.trim() ||
        profile?.repo_context?.trim() ||
        (profile?.source_hints ?? []).some((hint) => hint.trim()),
    );
    const missingRequiredContext: string[] = [];
    if (!hasBusinessContext) missingRequiredContext.push("hyperspell");
    if (!hasRepoContext) missingRequiredContext.push("nia_repo");

    return {
      has_profile: Boolean(profile),
      has_business_context: hasBusinessContext,
      has_repo_context: hasRepoContext,
      hyperspell_status: profile?.hyperspell_status ?? "not_configured",
      nia_status: hasRepoContext ? "ready" : "missing",
      missing_required_context: missingRequiredContext,
    };
  },
});

export const save = mutation({
  args: profileArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("product_context_profiles")
      .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id))
      .order("desc")
      .first();

    const profile = {
      owner_id: args.owner_id,
      company_name: args.company_name.trim(),
      product_url: cleanOptional(args.product_url),
      github_repo_url: cleanOptional(args.github_repo_url),
      business_context: args.business_context.trim(),
      repo_context: cleanOptional(args.repo_context),
      source_hints: cleanList(args.source_hints),
      hyperspell_status: "pending" as const,
      hyperspell_error: undefined,
      updated_at: now,
    };

    const profile_id = existing
      ? existing._id
      : await ctx.db.insert("product_context_profiles", {
          ...profile,
          created_at: now,
        });

    if (existing) {
      await ctx.db.patch(existing._id, profile);
    }

    await ctx.scheduler.runAfter(0, internal.productContextActions.seedHyperspell, {
      profile_id,
    });

    return { profile_id, hyperspell_status: profile.hyperspell_status };
  },
});

export const _get = internalQuery({
  args: { profile_id: v.id("product_context_profiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.profile_id);
  },
});

export const _markHyperspellStatus = internalMutation({
  args: {
    profile_id: v.id("product_context_profiles"),
    status: v.union(
      v.literal("not_configured"),
      v.literal("pending"),
      v.literal("seeded"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.profile_id, {
      hyperspell_status: args.status,
      hyperspell_error: args.error,
      updated_at: Date.now(),
    });
  },
});
