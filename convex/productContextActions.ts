"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { addMemory } from "../lib/hyperspell";

function profileToMemoryText(profile: {
  company_name: string;
  product_url?: string;
  github_repo_url?: string;
  business_context: string;
  repo_context?: string;
  source_hints: string[];
}) {
  return [
    `Company/product: ${profile.company_name}`,
    profile.product_url ? `Product URL: ${profile.product_url}` : undefined,
    profile.github_repo_url ? `GitHub repo: ${profile.github_repo_url}` : undefined,
    "",
    "Business context:",
    profile.business_context,
    "",
    profile.repo_context ? "Repo/source context:" : undefined,
    profile.repo_context,
    profile.source_hints.length > 0 ? "" : undefined,
    profile.source_hints.length > 0 ? "Source hints:" : undefined,
    ...profile.source_hints.map((hint) => `- ${hint}`),
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export const seedHyperspell = internalAction({
  args: { profile_id: v.id("product_context_profiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(internal.productContext._get, {
      profile_id: args.profile_id,
    });
    if (!profile) return;

    if (!process.env.HYPERSPELL_API_KEY) {
      await ctx.runMutation(internal.productContext._markHyperspellStatus, {
        profile_id: args.profile_id,
        status: "not_configured",
        error: "HYPERSPELL_API_KEY is not set.",
      });
      return;
    }

    try {
      await addMemory({
        userId: profile.owner_id,
        title: `Arbor product context: ${profile.company_name}`,
        collection: "arbor_product_context",
        resourceId: String(profile._id),
        text: profileToMemoryText(profile),
        date: new Date(profile.updated_at).toISOString(),
        metadata: {
          source: "arbor_product_context",
          company_name: profile.company_name,
          product_url: profile.product_url ?? null,
          github_repo_url: profile.github_repo_url ?? null,
        },
      });

      await ctx.runMutation(internal.productContext._markHyperspellStatus, {
        profile_id: args.profile_id,
        status: "seeded",
      });
    } catch (error) {
      await ctx.runMutation(internal.productContext._markHyperspellStatus, {
        profile_id: args.profile_id,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
    }
  },
});
