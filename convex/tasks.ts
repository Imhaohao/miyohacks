import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { buildOrchestrationContext } from "../lib/orchestration-context";
import {
  explainUnselectableExecutorBid,
  isSelectableExecutorBid,
} from "../lib/auction-selection";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertProjectOwned,
  assertTaskReadable,
  requireAccountId,
} from "./authHelpers";

export const BID_WINDOW_SECONDS = 15;

const taskStatusValidator = v.union(
  v.literal("open"),
  v.literal("shortlisting"),
  v.literal("planning"),
  v.literal("bidding"),
  v.literal("awarded"),
  v.literal("plan_review"),
  v.literal("approved"),
  v.literal("executing"),
  v.literal("judging"),
  v.literal("synthesizing"),
  v.literal("complete"),
  v.literal("disputed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanList(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
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

interface CreateTaskArgs {
  posted_by: string;
  project_id?: Id<"projects">;
  task_type?: string;
  prompt: string;
  max_budget: number;
  output_schema?: unknown;
  target_repo?: string;
  target_branch?: string;
  business_context?: string;
  repo_context?: string;
  source_hints?: string[];
}

async function latestProfileForTask(ctx: MutationCtx, args: CreateTaskArgs) {
  const profiles = await ctx.db
    .query("product_context_profiles")
    .withIndex("by_owner", (q) => q.eq("owner_id", args.posted_by))
    .collect();
  const matching = args.project_id
    ? profiles.filter((profile) => profile.project_id === args.project_id)
    : profiles;
  return matching.sort((a, b) => b.updated_at - a.updated_at)[0] ?? null;
}

async function createTask(ctx: MutationCtx, args: CreateTaskArgs) {
  const now = Date.now();
  const closesAt = now + BID_WINDOW_SECONDS * 1000;
  const profile = await latestProfileForTask(ctx, args);

  const profileBusiness = profile
    ? [
        `Company/product: ${profile.company_name}`,
        profile.product_url ? `Product URL: ${profile.product_url}` : undefined,
        profile.business_context,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
    : undefined;
  const profileRepo = profile
    ? [
        profile.github_repo_url ? `GitHub repo: ${profile.github_repo_url}` : undefined,
        profile.repo_context,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
    : undefined;
  const sourceHints = cleanList([
    profile?.github_repo_url,
    profile?.product_url,
    ...(profile?.source_hints ?? []),
    ...(args.source_hints ?? []),
  ]);
  const businessContext = cleanOptional(args.business_context) ?? profileBusiness;
  const repoContext = cleanOptional(args.repo_context) ?? profileRepo;

  const task_id = await ctx.db.insert("tasks", {
    posted_by: args.posted_by,
    task_type: args.task_type ?? "general",
    prompt: args.prompt,
    max_budget: args.max_budget,
    target_repo: cleanOptional(args.target_repo),
    target_branch: cleanOptional(args.target_branch),
    payment_status: "unfunded",
    output_schema: args.output_schema,
    status: "planning",
    bid_window_seconds: BID_WINDOW_SECONDS,
    bid_window_closes_at: closesAt,
    project_id: args.project_id,
    product_context_profile_id: profile?._id,
  });

  await ctx.runMutation(internal.payments._reserveTaskBudget, {
    task_id,
    buyer_id: args.posted_by,
    amount: args.max_budget,
  });

  const orchestrationContext = buildOrchestrationContext({
    prompt: args.prompt,
    taskType: args.task_type ?? "general",
    businessContext,
    repoContext,
    sourceHints,
  });

  await ctx.db.insert("task_contexts", {
    task_id,
    version: orchestrationContext.version,
    business: orchestrationContext.business,
    repo: orchestrationContext.repo,
    routing: orchestrationContext.routing,
    prompt_addendum: orchestrationContext.prompt_addendum,
    created_at: now,
  });

  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "task_posted",
    payload: {
      posted_by: args.posted_by,
      project_id: args.project_id,
      prompt: args.prompt,
      max_budget: args.max_budget,
      target_repo: cleanOptional(args.target_repo),
      target_branch: cleanOptional(args.target_branch),
    },
  });

  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "context_enriched",
    payload: orchestrationContext,
  });

  if (profile) {
    await ctx.runMutation(internal.lifecycle.log, {
      task_id,
      event_type: "product_context_attached",
      payload: {
        profile_id: profile._id,
        project_id: profile.project_id,
        company_name: profile.company_name,
        has_product_url: Boolean(profile.product_url),
        has_github_repo: Boolean(profile.github_repo_url),
        source_hint_count: sourceHints.length,
        hyperspell_status: profile.hyperspell_status,
      },
    });
  }

  await ctx.scheduler.runAfter(0, internal.planning.decompose, { task_id });

  return {
    task_id,
    status: "planning" as const,
    bid_window_closes_at: closesAt,
  };
}

/**
 * Post a new task. Creates the row in `bidding`, schedules bid solicitation
 * immediately and the auction resolution at window close.
 */
export const post = mutation({
  args: {
    posted_by: v.string(),
    task_type: v.optional(v.string()),
    prompt: v.string(),
    max_budget: v.number(),
    output_schema: v.optional(v.any()),
    target_repo: v.optional(v.string()),
    target_branch: v.optional(v.string()),
    business_context: v.optional(v.string()),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await createTask(ctx, args);
  },
});

export const postAuthenticated = mutation({
  args: {
    project_id: v.id("projects"),
    task_type: v.optional(v.string()),
    prompt: v.string(),
    max_budget: v.number(),
    output_schema: v.optional(v.any()),
    target_repo: v.optional(v.string()),
    target_branch: v.optional(v.string()),
    business_context: v.optional(v.string()),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const accountId = await requireAccountId(ctx);
    await assertProjectOwned(ctx, args.project_id, accountId);
    return await createTask(ctx, {
      posted_by: accountId,
      ...args,
    });
  },
});

export const postForAccount = mutation({
  args: {
    server_secret: v.optional(v.string()),
    account_id: v.string(),
    project_id: v.optional(v.id("projects")),
    task_type: v.optional(v.string()),
    prompt: v.string(),
    max_budget: v.number(),
    output_schema: v.optional(v.any()),
    target_repo: v.optional(v.string()),
    target_branch: v.optional(v.string()),
    business_context: v.optional(v.string()),
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
    return await createTask(ctx, {
      posted_by: args.account_id,
      project_id: project._id,
      task_type: args.task_type,
      prompt: args.prompt,
      max_budget: args.max_budget,
      output_schema: args.output_schema,
      target_repo: args.target_repo,
      target_branch: args.target_branch,
      business_context: args.business_context,
      repo_context: args.repo_context,
      source_hints: args.source_hints,
    });
  },
});

/**
 * Internal: create a sub-task for a step in a parent task's plan. The child
 * runs the same auction lifecycle as a top-level task, but skips the planner
 * (children don't recursively decompose) and reports back to the parent on
 * settle.
 */
export const _createChild = internalMutation({
  args: {
    parent_task_id: v.id("tasks"),
    step_index: v.number(),
    prompt: v.string(),
    max_budget: v.number(),
  },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parent_task_id);
    if (!parent) throw new Error(`parent ${args.parent_task_id} not found`);
    const now = Date.now();
    const closesAt = now + BID_WINDOW_SECONDS * 1000;
    const child_task_id = await ctx.db.insert("tasks", {
      posted_by: parent.posted_by,
      task_type: parent.task_type,
      prompt: args.prompt,
      max_budget: args.max_budget,
      payment_status: "funds_reserved",
      status: "bidding",
      bid_window_seconds: BID_WINDOW_SECONDS,
      bid_window_closes_at: closesAt,
      parent_task_id: args.parent_task_id,
      step_index: args.step_index,
      project_id: parent.project_id,
      product_context_profile_id: parent.product_context_profile_id,
      target_repo: parent.target_repo,
      target_branch: parent.target_branch,
    });
    await ctx.runMutation(internal.payments._allocateChildBudget, {
      parent_task_id: args.parent_task_id,
      child_task_id,
      amount: args.max_budget,
    });
    const parentContext = await ctx.db
      .query("task_contexts")
      .withIndex("by_task", (q) => q.eq("task_id", args.parent_task_id))
      .order("desc")
      .first();
    if (parentContext) {
      await ctx.db.insert("task_contexts", {
        task_id: child_task_id,
        version: parentContext.version,
        business: parentContext.business,
        repo: parentContext.repo,
        routing: parentContext.routing,
        prompt_addendum: `${parentContext.prompt_addendum}\n\nChild task focus:\n${args.prompt}`,
        created_at: now,
      });
    }
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: child_task_id,
      event_type: "task_posted",
      payload: {
        posted_by: parent.posted_by,
        prompt: args.prompt,
        max_budget: args.max_budget,
        parent_task_id: args.parent_task_id,
        step_index: args.step_index,
      },
    });
    if (parentContext) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: child_task_id,
        event_type: "context_inherited",
        payload: {
          parent_task_id: args.parent_task_id,
          product_context_profile_id: parent.product_context_profile_id,
        },
      });
    }
    return { child_task_id, bid_window_closes_at: closesAt };
  },
});

export const _setPlan = internalMutation({
  args: {
    task_id: v.id("tasks"),
    plan: v.array(
      v.object({
        prompt: v.string(),
        rationale: v.string(),
        specialist_hint: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { task_plan: args.plan });
  },
});

export const _childrenOf = internalQuery({
  args: { parent_task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) =>
        q.eq("parent_task_id", args.parent_task_id),
      )
      .collect();
    return children.sort(
      (a, b) => (a.step_index ?? 0) - (b.step_index ?? 0),
    );
  },
});

export const childrenOf = query({
  args: { parent_task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    await assertTaskReadable(ctx, args.parent_task_id);
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) =>
        q.eq("parent_task_id", args.parent_task_id),
      )
      .collect();
    return children.sort(
      (a, b) => (a.step_index ?? 0) - (b.step_index ?? 0),
    );
  },
});

/**
 * Public task fetch. Bids are stripped while the auction window is still open
 * (sealed-bid property). Use `bids.forTask` to fetch them after close.
 */
export const get = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await assertTaskReadable(ctx, args.task_id);
  },
});

export const getBundleForAccount = query({
  args: {
    server_secret: v.optional(v.string()),
    account_id: v.string(),
    task_id: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.server_secret);
    const task = await ctx.db.get(args.task_id);
    if (!task || task.posted_by !== args.account_id) {
      throw new Error("task not found");
    }
    const [
      bids,
      escrow,
      lifecycle,
      context,
      shortlist,
      executionPlan,
      approvalEvents,
      paymentLedger,
      children,
    ] = await Promise.all([
      Date.now() < task.bid_window_closes_at
        ? Promise.resolve([])
        : ctx.db
            .query("bids")
            .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
            .collect()
            .then((rows) =>
              rows.sort(
                (a, b) =>
                  (b.value_score ?? b.score) - (a.value_score ?? a.score),
              ),
            ),
      ctx.db
        .query("escrow")
        .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
        .first(),
      ctx.db
        .query("lifecycle_events")
        .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
        .collect()
        .then((rows) => rows.sort((a, b) => a.timestamp - b.timestamp)),
      ctx.db
        .query("task_contexts")
        .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
        .order("desc")
        .first(),
      ctx.db
        .query("agent_shortlists")
        .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
        .collect()
        .then((rows) => rows.sort((a, b) => a.rank - b.rank)),
      ctx.db
        .query("execution_plans")
        .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
        .order("desc")
        .first(),
      ctx.db
        .query("approval_events")
        .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
        .collect()
        .then((rows) => rows.sort((a, b) => a.timestamp - b.timestamp)),
      ctx.db
        .query("ledger_entries")
        .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
        .collect()
        .then((rows) => rows.sort((a, b) => a.created_at - b.created_at)),
      ctx.db
        .query("tasks")
        .withIndex("by_parent", (q) => q.eq("parent_task_id", args.task_id))
        .collect()
        .then((rows) =>
          rows.sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0)),
        ),
    ]);
    return {
      task,
      bids,
      escrow,
      lifecycle,
      context,
      shortlist,
      execution_plan: executionPlan,
      approval_events: approvalEvents,
      payment_ledger: paymentLedger,
      children,
    };
  },
});

// ─── internal helpers used by auction actions ─────────────────────────────

export const _get = internalQuery({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) throw new Error(`task ${args.task_id} not found`);
    return task;
  },
});

export const _setStatus = internalMutation({
  args: { task_id: v.id("tasks"), status: taskStatusValidator },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { status: args.status });
  },
});

export const _setWinner = internalMutation({
  args: {
    task_id: v.id("tasks"),
    winning_bid_id: v.id("bids"),
    price_paid: v.number(),
  },
  handler: async (ctx, args) => {
    const [task, winningBid] = await Promise.all([
      ctx.db.get(args.task_id),
      ctx.db.get(args.winning_bid_id),
    ]);
    if (!task) throw new Error("task not found");
    if (!winningBid || winningBid.task_id !== args.task_id) {
      throw new Error("winning bid does not belong to this task");
    }
    if (!isSelectableExecutorBid(winningBid, task.max_budget)) {
      throw new Error(
        `winning bid is not selectable: ${
          explainUnselectableExecutorBid(winningBid, task.max_budget) ??
          "unknown reason"
        }`,
      );
    }
    await ctx.db.patch(args.task_id, {
      status: "awarded",
      winning_bid_id: args.winning_bid_id,
      price_paid: args.price_paid,
    });
  },
});

export const _setResult = internalMutation({
  args: { task_id: v.id("tasks"), result: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { result: args.result });
  },
});

export const _setVerdict = internalMutation({
  args: { task_id: v.id("tasks"), verdict: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { judge_verdict: args.verdict });
  },
});

/**
 * Reset the bid window. Called by the enrichment phase after Hyperspell/Nia
 * context is attached so the visible 15s countdown starts cleanly *after*
 * enrichment, not from the moment the task was posted.
 */
export const _setBidWindow = internalMutation({
  args: { task_id: v.id("tasks"), bid_window_closes_at: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, {
      bid_window_closes_at: args.bid_window_closes_at,
    });
  },
});
