import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { accountIdForClerkUserId, requireAccountId } from "./authHelpers";
import { FREE_TRIAL_CREDITS, roundMoney } from "../lib/payments";

interface TrialGrantResult {
  granted: boolean;
  idempotent: boolean;
  amount?: number;
}

interface EnsureAccountResult {
  account: Doc<"user_accounts">;
  default_project: Doc<"projects">;
  trial: TrialGrantResult;
}

interface AccountMeResult {
  account: Doc<"user_accounts"> | null;
  projects: Doc<"projects">[];
  trial_credits: number;
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

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function upsertAccount(
  ctx: MutationCtx,
  input: {
    clerk_user_id: string;
    token_identifier?: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
  },
): Promise<{ account: Doc<"user_accounts">; created: boolean }> {
  const now = Date.now();
  const accountId = accountIdForClerkUserId(input.clerk_user_id);
  const existingByToken = input.token_identifier
    ? await ctx.db
        .query("user_accounts")
        .withIndex("by_token_identifier", (q) =>
          q.eq("token_identifier", input.token_identifier),
        )
        .first()
    : null;
  const existing =
    existingByToken ??
    (await ctx.db
      .query("user_accounts")
      .withIndex("by_clerk_user", (q) =>
        q.eq("clerk_user_id", input.clerk_user_id),
      )
      .first());

  const patch = {
    account_id: accountId,
    clerk_user_id: input.clerk_user_id,
    token_identifier: cleanOptional(input.token_identifier),
    email: cleanOptional(input.email),
    display_name: cleanOptional(input.display_name),
    avatar_url: cleanOptional(input.avatar_url),
    updated_at: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    const account = await ctx.db.get(existing._id);
    if (!account) throw new Error("failed to update account");
    return { account, created: false };
  }

  const id = await ctx.db.insert("user_accounts", {
    ...patch,
    created_at: now,
  });
  const account = await ctx.db.get(id);
  if (!account) throw new Error("failed to create account");
  return { account, created: true };
}

async function ensureDefaultProject(
  ctx: MutationCtx,
  account: Doc<"user_accounts">,
): Promise<Doc<"projects">> {
  const existing = await ctx.db
    .query("projects")
    .withIndex("by_owner", (q) => q.eq("owner_account_id", account.account_id))
    .order("asc")
    .first();
  if (existing) return existing;

  const now = Date.now();
  const id = await ctx.db.insert("projects", {
    owner_account_id: account.account_id,
    name: account.display_name ? `${account.display_name}'s project` : "Default project",
    created_at: now,
    updated_at: now,
  });
  const project = await ctx.db.get(id);
  if (!project) throw new Error("failed to create default project");
  return project;
}

async function grantTrialCredits(
  ctx: MutationCtx,
  account: Doc<"user_accounts">,
): Promise<TrialGrantResult> {
  const wallet = await ctx.db
    .query("buyer_wallets")
    .withIndex("by_buyer", (q) => q.eq("buyer_id", account.account_id))
    .first();
  const alreadyGranted = roundMoney(wallet?.lifetime_granted ?? 0);
  const missingTrialCredits = roundMoney(FREE_TRIAL_CREDITS - alreadyGranted);
  if (missingTrialCredits <= 0) {
    if (!account.trial_credits_granted_at) {
      const now = Date.now();
      await ctx.db.patch(account._id, {
        trial_credits_granted_at: now,
        updated_at: now,
      });
    }
    return { granted: false, idempotent: true, amount: 0 };
  }
  const result = (await ctx.runMutation(internal.payments._grantTrialCreditsIfNeeded, {
    account_id: account.account_id,
    amount: missingTrialCredits,
  })) as TrialGrantResult;
  const now = Date.now();
  await ctx.db.patch(account._id, { trial_credits_granted_at: now, updated_at: now });
  return { ...result, amount: missingTrialCredits };
}

export const me = query({
  args: {},
  handler: async (ctx): Promise<AccountMeResult> => {
    const accountId = await requireAccountId(ctx);
    const account = await ctx.db
      .query("user_accounts")
      .withIndex("by_account", (q) => q.eq("account_id", accountId))
      .first();
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("owner_account_id", accountId))
      .collect();
    return {
      account,
      projects: projects.sort((a, b) => a.created_at - b.created_at),
      trial_credits: FREE_TRIAL_CREDITS,
    };
  },
});

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx): Promise<EnsureAccountResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("authentication required");
    const { account } = await upsertAccount(ctx, {
      clerk_user_id: identity.subject,
      token_identifier: identity.tokenIdentifier,
      email: identity.email,
      display_name: identity.name ?? identity.preferredUsername,
      avatar_url: identity.pictureUrl,
    });
    const project = await ensureDefaultProject(ctx, account);
    const trial = await grantTrialCredits(ctx, account);
    return { account, default_project: project, trial };
  },
});

export const ensureByClerkUser = mutation({
  args: {
    server_secret: v.optional(v.string()),
    clerk_user_id: v.string(),
    token_identifier: v.optional(v.string()),
    email: v.optional(v.string()),
    display_name: v.optional(v.string()),
    avatar_url: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EnsureAccountResult> => {
    requireServerSecret(args.server_secret);
    const { account } = await upsertAccount(ctx, args);
    const project = await ensureDefaultProject(ctx, account);
    const trial = await grantTrialCredits(ctx, account);
    return { account, default_project: project, trial };
  },
});
