import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { UserIdentity } from "convex/server";

type ReadCtx = QueryCtx | MutationCtx;

export function accountIdForClerkUserId(clerkUserId: string) {
  return `clerk:${clerkUserId}`;
}

export function accountIdForTokenIdentifier(tokenIdentifier: string) {
  return `clerk-token:${tokenIdentifier}`;
}

export function accountIdForIdentity(identity: Pick<UserIdentity, "tokenIdentifier" | "subject">) {
  return accountIdForTokenIdentifier(identity.tokenIdentifier);
}

export function isClerkAccountId(accountId: string) {
  return accountId.startsWith("clerk:") || accountId.startsWith("clerk-token:");
}

export async function requireAccountId(ctx: ReadCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("authentication required");
  const tokenAccount = await ctx.db
    .query("user_accounts")
    .withIndex("by_token_identifier", (q) =>
      q.eq("token_identifier", identity.tokenIdentifier),
    )
    .first();
  if (tokenAccount) return tokenAccount.account_id;

  // Transitional fallback for accounts created before token_identifier was
  // stored. Ownership is still derived server-side from the authenticated
  // identity; ensureCurrentUser will backfill token_identifier on next write.
  const legacyAccount = await ctx.db
    .query("user_accounts")
    .withIndex("by_clerk_user", (q) => q.eq("clerk_user_id", identity.subject))
    .first();
  if (legacyAccount) return legacyAccount.account_id;

  return accountIdForIdentity(identity);
}

export async function assertProjectOwned(
  ctx: ReadCtx,
  projectId: Id<"projects">,
  accountId: string,
) {
  const project = await ctx.db.get(projectId);
  if (!project || project.owner_account_id !== accountId) {
    throw new Error("project not found");
  }
  return project;
}

export async function assertTaskReadable(
  ctx: ReadCtx,
  taskId: Id<"tasks">,
) {
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error("task not found");
  if (isClerkAccountId(task.posted_by)) {
    const accountId = await requireAccountId(ctx);
    if (task.posted_by !== accountId) throw new Error("task not found");
  }
  return task;
}

export async function actorForCurrentUser(ctx: ReadCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity ? await requireAccountId(ctx) : "buyer:web";
}
