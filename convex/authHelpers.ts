import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export function accountIdForClerkUserId(clerkUserId: string) {
  return `clerk:${clerkUserId}`;
}

export function isClerkAccountId(accountId: string) {
  return accountId.startsWith("clerk:");
}

export async function requireAccountId(ctx: ReadCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("authentication required");
  return accountIdForClerkUserId(identity.subject);
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
  return identity ? accountIdForClerkUserId(identity.subject) : "buyer:web";
}
