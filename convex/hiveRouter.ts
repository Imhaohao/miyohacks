"use node";

// Hive router (Layer 5). routeNode shortlists candidate agents for a single
// DAG node, mints a child auction task scoped to that shortlist (via
// invited_agent_ids), and kicks off the EXISTING Vickrey auction on it. The
// auction mechanism (solicitBids + resolve) is reused, never reimplemented.
//
// "use node" because we call the Anthropic helper (lib/anthropic.ts) for task
// classification and the registry search action.

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BID_WINDOW_SECONDS } from "./tasks";
import { callClaudeJSON, CLAUDE_FAST_MODEL } from "../lib/anthropic";
import {
  buildRoutingQuery,
  perNodeBudget,
  shouldFallbackOpen,
} from "../lib/hive/router-core";
import { assembleNodeContext } from "../lib/hive/context-store";

const VALID_TASK_CLASSES = new Set([
  "reasoning",
  "classification",
  "extraction",
  "generation",
]);
const DEFAULT_TASK_CLASS = "reasoning";
const HINT_PREFIX_CHARS = 100;

const CLASSIFY_SYSTEM_PROMPT =
  'Respond with exactly one of: reasoning, classification, extraction, generation. ' +
  "Choose the single best task class for the described sub-task. " +
  'Output strict JSON {"task_class":"..."}.';

/**
 * Route one DAG node: classify it, shortlist agents, create a scoped child
 * auction task and start the Vickrey auction.
 *
 * Idempotent: the orchestrator claims a node by flipping it to "auctioned"
 * before scheduling routeNode. If routeNode is delivered more than once, every
 * call after the first sees a node whose status is no longer "auctioned" and
 * returns immediately without minting a duplicate child task.
 */
export const routeNode = internalAction({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    // Set by the orchestrator's bounded open-retry: skip the registry shortlist
    // and run a full open auction (every roster agent may bid). This is the
    // safety valve when a node's shortlisted auction produced no plausible bid.
    force_open: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const dag = await ctx.runQuery(internal.hiveData._getDag, {
      dag_id: args.dag_id,
    });
    if (!dag) {
      console.warn(`[hive-router] dag ${args.dag_id} not found; skipping`);
      return null;
    }

    const node = await ctx.runQuery(internal.hiveData._getNodeByDagAndNodeId, {
      dag_id: args.dag_id,
      node_id: args.node_id,
    });
    if (!node || node.status !== "auctioned") {
      console.warn(
        `[hive-router] node ${args.node_id} in dag ${args.dag_id} is not ` +
          `"auctioned" (status=${node?.status ?? "missing"}); skipping (idempotent)`,
      );
      return null;
    }

    // 1. Dependency outputs from the scratchpad: for each upstream node, take
    //    its most recent "result" entries (best-effort; never block routing).
    //    This single read path feeds BOTH the routing-query hints and the
    //    shared-context block injected into the child prompt below.
    type ContextEntry = {
      entry_id: string;
      agent_id: string;
      kind: string;
      confidence: number;
      content: string;
      created_at: number;
    };
    const dependencyEntries: ContextEntry[] = [];
    for (const depId of node.depends_on) {
      try {
        const rows = await ctx.runQuery(internal.scratchpad._forNode, {
          dag_id: args.dag_id,
          node_id: depId,
        });
        const results = rows
          .filter((row) => row.kind === "result")
          .slice(0, 2);
        for (const row of results) {
          dependencyEntries.push({
            entry_id: String(row._id),
            agent_id: row.agent_id,
            kind: row.kind,
            confidence: row.confidence,
            content: row.content,
            created_at: row.created_at,
          });
        }
      } catch (err) {
        console.warn(
          `[hive-router] scratchpad._forNode(${depId}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    const hints = dependencyEntries
      .map((entry) => entry.content.slice(0, HINT_PREFIX_CHARS))
      .filter((line): line is string => Boolean(line && line.trim()));

    // Semantic recall over the whole DAG scratchpad (best-effort). The action
    // returns `entry` as `any`, so we narrow each hit to RecallEntry at map.
    type RecallEntry = {
      _id: Id<"scratchpad_entries">;
      agent_id: string;
      kind: string;
      confidence: number;
      content: string;
      created_at: number;
    };
    let recall: Array<{ entry: unknown; score: number }> = [];
    try {
      recall = await ctx.runAction(api.scratchpadActions.semanticRecall, {
        dag_id: args.dag_id,
        query: node.description,
        limit: 5,
      });
    } catch (err) {
      console.warn(
        `[hive-router] scratchpadActions.semanticRecall failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      recall = [];
    }
    const recallEntries: ContextEntry[] = recall.map((r) => {
      const e = r.entry as RecallEntry;
      return {
        entry_id: String(e._id),
        agent_id: e.agent_id,
        kind: e.kind,
        confidence: e.confidence,
        content: e.content,
        created_at: e.created_at,
      };
    });

    const sharedContext = assembleNodeContext({
      dependencyEntries,
      recallEntries,
      maxChars: 4000,
    });

    // 2. Resolve the task class (classify only if not already set).
    let taskClass = node.task_class;
    if (!taskClass) {
      taskClass = DEFAULT_TASK_CLASS;
      try {
        const classified = await callClaudeJSON<{ task_class: string }>({
          model: CLAUDE_FAST_MODEL,
          systemPrompt: CLASSIFY_SYSTEM_PROMPT,
          userPrompt: node.description,
          maxTokens: 64,
        });
        const candidate = classified?.task_class?.trim().toLowerCase();
        if (candidate && VALID_TASK_CLASSES.has(candidate)) {
          taskClass = candidate;
        }
      } catch (err) {
        console.warn(
          `[hive-router] task classification failed; defaulting to ` +
            `${DEFAULT_TASK_CLASS}: ${
              err instanceof Error ? err.message : String(err)
            }`,
        );
      }
      await ctx.runMutation(internal.hiveData._patchNode, {
        dag_id: args.dag_id,
        node_id: args.node_id,
        task_class: taskClass,
      });
    }

    // 3. Per-node budget + agent shortlist.
    const nodes = await ctx.runQuery(internal.hiveData._getNodes, {
      dag_id: args.dag_id,
    });
    const nodeCount = nodes.length;
    const budget = perNodeBudget(dag.max_budget, nodeCount);

    const query = buildRoutingQuery(
      { description: node.description, success_criteria: node.success_criteria },
      hints,
    );
    // On a force_open retry, skip the semantic shortlist entirely and run an
    // open auction (invited = undefined). Otherwise shortlist, falling back to
    // open when the candidate set is too thin (shouldFallbackOpen).
    const candidates = args.force_open
      ? []
      : await ctx.runAction(api.hiveRegistry.searchAgents, {
          query,
          top_k: 6,
          min_reputation: 0.3,
          max_cost: budget,
        });
    const invited =
      args.force_open || shouldFallbackOpen(candidates)
        ? undefined
        : candidates.map((c) => c.agent_id);

    // 4. Stable per-node step index: position of this node_id in the
    //    ascending-sorted list of all node_ids in the DAG.
    const sortedNodeIds = nodes
      .map((n) => n.node_id)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const stepIndex = Math.max(0, sortedNodeIds.indexOf(args.node_id));

    const childPrompt =
      node.description +
      (node.success_criteria
        ? `\n\nSuccess criteria: ${node.success_criteria}`
        : "") +
      `\n\nTask class: ${taskClass}` +
      (sharedContext
        ? "\n\n---\nShared scratchpad (written by other agents in this hive " +
          "task; verify before relying on low-confidence items):\n" +
          sharedContext +
          "\n---"
        : "");

    // NOTE: passing parent_task_id = dag.root_task_id means auctions.settle
    // will later call internal.planning.advanceOrSynthesize on the root task,
    // which is wrong for hive parents until Agent Task 19 adds a hive guard.
    // We follow the spec exactly here (the guard lands separately).
    const created: { child_task_id: Id<"tasks">; bid_window_closes_at: number } =
      await ctx.runMutation(internal.tasks._createChild, {
        parent_task_id: dag.root_task_id,
        step_index: stepIndex,
        prompt: childPrompt,
        max_budget: budget,
      });
    const childTaskId = created.child_task_id;

    await ctx.runMutation(internal.hiveData._patchTaskHiveFields, {
      task_id: childTaskId,
      hive_dag_id: args.dag_id,
      hive_node_id: args.node_id,
      invited_agent_ids: invited,
      success_criteria: node.success_criteria,
    });

    // 5. Mark the node executing and link it to its child task.
    await ctx.runMutation(internal.hiveData._patchNode, {
      dag_id: args.dag_id,
      node_id: args.node_id,
      status: "executing",
      task_id: childTaskId,
    });

    // 6. Lifecycle breadcrumb on the root task.
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: dag.root_task_id,
      event_type: "hive_node_routed",
      payload: {
        node_id: args.node_id,
        child_task_id: childTaskId,
        invited: invited ?? "open",
        candidate_count: candidates.length,
        task_class: taskClass,
        budget,
        force_open: Boolean(args.force_open),
      },
    });

    // 7. Start the EXISTING Vickrey auction on the child task.
    await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, {
      task_id: childTaskId,
    });
    await ctx.scheduler.runAfter(
      BID_WINDOW_SECONDS * 1000,
      internal.auctions.resolve,
      { task_id: childTaskId },
    );
    await ctx.scheduler.runAfter(
      BID_WINDOW_SECONDS * 1000 + 5000,
      internal.hiveOrchestrator.onNodeSettled,
      { task_id: childTaskId },
    );

    return null;
  },
});
