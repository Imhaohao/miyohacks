// Hive-mind DAG data-access layer (Layer 2). Pure CRUD over the hive_dags and
// hive_nodes tables plus the tasks-row linkage fields. Default Convex runtime
// only — no "use node", no external I/O. Every read is index-based; no .filter.
//
// Status unions are copied verbatim from convex/schema.ts so validators match
// the table definitions exactly.

import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// hive_dags.status
const dagStatusValidator = v.union(
  v.literal("planning"),
  v.literal("running"),
  v.literal("evaluating"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("escalated"),
);

// hive_nodes.status
const nodeStatusValidator = v.union(
  v.literal("pending"),
  v.literal("ready"),
  v.literal("auctioned"),
  v.literal("executing"),
  v.literal("complete"),
  v.literal("failed"),
);

// 1. Insert a DAG row, return its id.
export const _insertDag = internalMutation({
  args: {
    root_task_id: v.id("tasks"),
    goal: v.string(),
    status: dagStatusValidator,
    planner_model: v.string(),
    max_budget: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  },
  returns: v.id("hive_dags"),
  handler: async (ctx, args): Promise<Id<"hive_dags">> => {
    return await ctx.db.insert("hive_dags", {
      root_task_id: args.root_task_id,
      goal: args.goal,
      status: args.status,
      planner_model: args.planner_model,
      max_budget: args.max_budget,
      created_at: args.created_at,
      updated_at: args.updated_at,
    });
  },
});

// 2. Bulk-insert nodes for a DAG. Each starts "pending".
export const _insertNodes = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    nodes: v.array(
      v.object({
        node_id: v.string(),
        description: v.string(),
        depends_on: v.array(v.string()),
        success_criteria: v.optional(v.string()),
        task_class: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now();
    for (const node of args.nodes) {
      await ctx.db.insert("hive_nodes", {
        dag_id: args.dag_id,
        node_id: node.node_id,
        description: node.description,
        depends_on: node.depends_on,
        success_criteria: node.success_criteria,
        task_class: node.task_class,
        status: "pending",
        updated_at: now,
      });
    }
    return null;
  },
});

// 3. Patch a DAG's status.
export const _setDagStatus = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    status: dagStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.dag_id, {
      status: args.status,
      updated_at: Date.now(),
    });
    return null;
  },
});

// 4. Patch a single node's status by (dag_id, node_id).
export const _setNodeStatus = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    status: nodeStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const node = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag_and_node_id", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .first();
    if (node) {
      await ctx.db.patch(node._id, {
        status: args.status,
        updated_at: Date.now(),
      });
    }
    return null;
  },
});

// 5. Get a DAG by id (or null).
export const _getDag = internalQuery({
  args: { dag_id: v.id("hive_dags") },
  returns: v.union(
    v.object({
      _id: v.id("hive_dags"),
      _creationTime: v.number(),
      root_task_id: v.id("tasks"),
      goal: v.string(),
      status: dagStatusValidator,
      planner_model: v.string(),
      max_budget: v.number(),
      created_at: v.number(),
      updated_at: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<Doc<"hive_dags"> | null> => {
    return await ctx.db.get(args.dag_id);
  },
});

const nodeDocValidator = v.object({
  _id: v.id("hive_nodes"),
  _creationTime: v.number(),
  dag_id: v.id("hive_dags"),
  node_id: v.string(),
  description: v.string(),
  depends_on: v.array(v.string()),
  success_criteria: v.optional(v.string()),
  task_class: v.optional(v.string()),
  status: nodeStatusValidator,
  task_id: v.optional(v.id("tasks")),
  assigned_agent_id: v.optional(v.string()),
  output_text: v.optional(v.string()),
  eval_score: v.optional(v.number()),
  updated_at: v.number(),
});

const evaluationVerdictValidator = v.union(
  v.literal("accept"),
  v.literal("reject"),
);

const escalationKindValidator = v.union(
  v.literal("low_confidence"),
  v.literal("conflict_tie"),
);

// 6. All nodes for a DAG (index-based).
export const _getNodes = internalQuery({
  args: { dag_id: v.id("hive_dags") },
  returns: v.array(nodeDocValidator),
  handler: async (ctx, args): Promise<Array<Doc<"hive_nodes">>> => {
    return await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .collect();
  },
});

// 7. Single node by (dag_id, node_id).
export const _getNodeByDagAndNodeId = internalQuery({
  args: { dag_id: v.id("hive_dags"), node_id: v.string() },
  returns: v.union(nodeDocValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<"hive_nodes"> | null> => {
    return await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag_and_node_id", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .first();
  },
});

// 8. Patch arbitrary node fields (only the provided ones) by (dag_id, node_id).
export const _patchNode = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    status: v.optional(nodeStatusValidator),
    task_id: v.optional(v.id("tasks")),
    assigned_agent_id: v.optional(v.string()),
    output_text: v.optional(v.string()),
    eval_score: v.optional(v.number()),
    task_class: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const node = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag_and_node_id", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .first();
    if (!node) return null;

    const patch: Partial<Doc<"hive_nodes">> = { updated_at: Date.now() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.task_id !== undefined) patch.task_id = args.task_id;
    if (args.assigned_agent_id !== undefined) {
      patch.assigned_agent_id = args.assigned_agent_id;
    }
    if (args.output_text !== undefined) patch.output_text = args.output_text;
    if (args.eval_score !== undefined) patch.eval_score = args.eval_score;
    if (args.task_class !== undefined) patch.task_class = args.task_class;

    await ctx.db.patch(node._id, patch);
    return null;
  },
});

// 9. Link a task row to its hive DAG.
export const _setHiveDagId = internalMutation({
  args: {
    task_id: v.id("tasks"),
    hive_dag_id: v.id("hive_dags"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.task_id, { hive_dag_id: args.hive_dag_id });
    return null;
  },
});

// 10. Find the node that owns a given task id.
export const _getNodeByTaskId = internalQuery({
  args: { task_id: v.id("tasks") },
  returns: v.union(nodeDocValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<"hive_nodes"> | null> => {
    return await ctx.db
      .query("hive_nodes")
      .withIndex("by_task_id", (q) => q.eq("task_id", args.task_id))
      .first();
  },
});

// 11. Tally node statuses for a DAG.
export const _countNodesByStatus = internalQuery({
  args: { dag_id: v.id("hive_dags") },
  returns: v.object({
    pending: v.number(),
    ready: v.number(),
    auctioned: v.number(),
    executing: v.number(),
    complete: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args) => {
    const counts = {
      pending: 0,
      ready: 0,
      auctioned: 0,
      executing: 0,
      complete: 0,
      failed: 0,
    };
    const nodes = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .collect();
    for (const node of nodes) {
      counts[node.status] += 1;
    }
    return counts;
  },
});

// 12. Patch the hive linkage fields onto a task row.
export const _patchTaskHiveFields = internalMutation({
  args: {
    task_id: v.id("tasks"),
    hive_dag_id: v.id("hive_dags"),
    hive_node_id: v.string(),
    invited_agent_ids: v.optional(v.array(v.string())),
    success_criteria: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const patch: Partial<Doc<"tasks">> = {
      hive_dag_id: args.hive_dag_id,
      hive_node_id: args.hive_node_id,
    };
    if (args.invited_agent_ids !== undefined) {
      patch.invited_agent_ids = args.invited_agent_ids;
    }
    if (args.success_criteria !== undefined) {
      patch.success_criteria = args.success_criteria;
    }
    await ctx.db.patch(args.task_id, patch);
    return null;
  },
});

// 13. Insert a hive evaluation row.
export const _insertEvaluation = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.optional(v.string()),
    agent_id: v.string(),
    score: v.number(),
    verdict: evaluationVerdictValidator,
    reasoning: v.string(),
    conflicts_with: v.optional(v.array(v.string())),
    judge_model: v.string(),
  },
  returns: v.id("hive_evaluations"),
  handler: async (ctx, args): Promise<Id<"hive_evaluations">> => {
    return await ctx.db.insert("hive_evaluations", {
      ...args,
      created_at: Date.now(),
    });
  },
});

// 14. Open a human-review escalation.
export const _insertEscalation = internalMutation({
  args: {
    dag_id: v.optional(v.id("hive_dags")),
    task_id: v.id("tasks"),
    kind: escalationKindValidator,
    reason: v.string(),
    payload: v.optional(v.any()),
  },
  returns: v.id("escalations"),
  handler: async (ctx, args): Promise<Id<"escalations">> => {
    return await ctx.db.insert("escalations", {
      ...args,
      status: "open",
      created_at: Date.now(),
    });
  },
});

// 15. Patch the root task with the DAG-level synthesized result.
export const _setRootResult = internalMutation({
  args: {
    task_id: v.id("tasks"),
    result: v.any(),
    judge_verdict: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.task_id, {
      result: args.result,
      judge_verdict: args.judge_verdict,
    });
    return null;
  },
});

// PUBLIC: resolve a hive child task to the shared DAG and node.
export const dagForTask = query({
  args: { task_id: v.id("tasks") },
  returns: v.union(
    v.object({ dag_id: v.id("hive_dags"), node_id: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const node = await ctx.db
      .query("hive_nodes")
      .withIndex("by_task_id", (q) => q.eq("task_id", args.task_id))
      .first();
    if (!node) return null;
    return { dag_id: node.dag_id, node_id: node.node_id };
  },
});

// PUBLIC: fetch the DAG row for a root task.
export const dagForRootTask = query({
  args: { task_id: v.id("tasks") },
  returns: v.union(
    v.object({
      _id: v.id("hive_dags"),
      _creationTime: v.number(),
      root_task_id: v.id("tasks"),
      goal: v.string(),
      status: dagStatusValidator,
      planner_model: v.string(),
      max_budget: v.number(),
      created_at: v.number(),
      updated_at: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<Doc<"hive_dags"> | null> => {
    return await ctx.db
      .query("hive_dags")
      .withIndex("by_root_task", (q) => q.eq("root_task_id", args.task_id))
      .first();
  },
});

// PUBLIC: count nodes for a DAG. Used by the live E2E probe.
export const nodeCountForDag = query({
  args: { dag_id: v.id("hive_dags") },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const nodes = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .collect();
    return nodes.length;
  },
});
