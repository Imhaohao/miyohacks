import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { assertProjectOwned, requireAccountId } from "./authHelpers";

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

function requireServerSecret(secret: string | undefined) {
  const expected = process.env.PAYMENT_SERVER_SECRET?.trim();
  if (!expected) {
    throw new Error("PAYMENT_SERVER_SECRET is required");
  }
  if (secret !== expected) {
    throw new Error("invalid server secret");
  }
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

export const latestForProject = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const accountId = await requireAccountId(ctx);
    await assertProjectOwned(ctx, args.project_id, accountId);
    const profiles = await ctx.db
      .query("product_context_profiles")
      .withIndex("by_owner", (q) => q.eq("owner_id", accountId))
      .collect();
    return (
      profiles
        .filter((profile) => profile.project_id === args.project_id)
        .sort((a, b) => b.updated_at - a.updated_at)[0] ?? null
    );
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

export const readinessForProject = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const accountId = await requireAccountId(ctx);
    await assertProjectOwned(ctx, args.project_id, accountId);
    const profiles = await ctx.db
      .query("product_context_profiles")
      .withIndex("by_owner", (q) => q.eq("owner_id", accountId))
      .collect();
    const profile =
      profiles
        .filter((row) => row.project_id === args.project_id)
        .sort((a, b) => b.updated_at - a.updated_at)[0] ?? null;

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

export const saveForProject = mutation({
  args: {
    project_id: v.id("projects"),
    company_name: v.string(),
    product_url: v.optional(v.string()),
    github_repo_url: v.optional(v.string()),
    business_context: v.string(),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const accountId = await requireAccountId(ctx);
    const project = await assertProjectOwned(ctx, args.project_id, accountId);
    const now = Date.now();
    const profiles = await ctx.db
      .query("product_context_profiles")
      .withIndex("by_owner", (q) => q.eq("owner_id", accountId))
      .collect();
    const existing =
      profiles
        .filter((profile) => profile.project_id === args.project_id)
        .sort((a, b) => b.updated_at - a.updated_at)[0] ?? null;

    const productUrl = cleanOptional(args.product_url);
    const githubRepoUrl = cleanOptional(args.github_repo_url);
    const profile = {
      owner_id: accountId,
      project_id: args.project_id,
      company_name: args.company_name.trim(),
      product_url: productUrl,
      github_repo_url: githubRepoUrl,
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

    await ctx.db.patch(project._id, {
      name: profile.company_name || project.name,
      product_url: productUrl,
      github_repo_url: githubRepoUrl,
      updated_at: now,
    });

    await ctx.scheduler.runAfter(0, internal.productContextActions.seedHyperspell, {
      profile_id,
    });

    return { profile_id, hyperspell_status: profile.hyperspell_status };
  },
});

export const saveForAccount = mutation({
  args: {
    server_secret: v.optional(v.string()),
    account_id: v.string(),
    project_id: v.optional(v.id("projects")),
    company_name: v.string(),
    product_url: v.optional(v.string()),
    github_repo_url: v.optional(v.string()),
    business_context: v.string(),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    const project =
      args.project_id !== undefined
        ? await assertProjectOwned(ctx, args.project_id, args.account_id)
        : await ctx.db
            .query("projects")
            .withIndex("by_owner", (q) =>
              q.eq("owner_account_id", args.account_id),
            )
            .order("asc")
            .first();
    if (!project) throw new Error("project not found");

    const now = Date.now();
    const existing = await ctx.db
      .query("product_context_profiles")
      .withIndex("by_owner", (q) => q.eq("owner_id", args.account_id))
      .collect()
      .then((profiles) =>
        profiles
          .filter((profile) => profile.project_id === project._id)
          .sort((a, b) => b.updated_at - a.updated_at)[0] ?? null,
      );

    const productUrl = cleanOptional(args.product_url);
    const githubRepoUrl = cleanOptional(args.github_repo_url);
    const profile = {
      owner_id: args.account_id,
      project_id: project._id,
      company_name: args.company_name.trim(),
      product_url: productUrl,
      github_repo_url: githubRepoUrl,
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
    if (existing) await ctx.db.patch(existing._id, profile);

    await ctx.db.patch(project._id, {
      name: profile.company_name || project.name,
      product_url: productUrl,
      github_repo_url: githubRepoUrl,
      updated_at: now,
    });

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
