"use node";

// Hive-mind DAG execution engine (Layer 3). Two internalActions drive the
// whole graph forward:
//   - advance        : claim-and-schedule the currently-runnable nodes, propagate
//                       failures, and detect completion.
//   - onNodeSettled  : translate a settled task back onto its hive node, write a
//                       scratchpad memory, then re-run advance.
//
// Idempotency is the core invariant. The Convex scheduler may deliver duplicate
// runs, and onNodeSettled re-triggers advance on every settle. The claim-before-
// schedule pattern (flip pending/ready -> "auctioned" BEFORE scheduling routeNode)
// makes advance safe to call any number of times: once a node is "auctioned" it
// is no longer in the ready set, so it is never double-routed.

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { makeFunctionReference } from "convex/server";
import { readyNodes, type PlannedNode } from "../lib/hive/dag";

// Task 15 implements hiveEvaluator.evaluateDag. Referenced by string so this
// file pushes cleanly before that module exists.
const evaluateDagRef = makeFunctionReference<"action">(
  "hiveEvaluator:evaluateDag",
);

const MAX_OUTPUT_CHARS = 50000;
const MAX_SCRATCHPAD_CHARS = 8000;

export const advance = internalAction({
  args: { dag_id: v.id("hive_dags") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // 1. Load dag + nodes; bail if the dag is gone or already terminal.
    const dag = await ctx.runQuery(internal.hiveData._getDag, {
      dag_id: args.dag_id,
    });
    if (
      dag === null ||
      dag.status === "complete" ||
      dag.status === "failed" ||
      dag.status === "escalated"
    ) {
      return null;
    }

    let nodes = await ctx.runQuery(internal.hiveData._getNodes, {
      dag_id: args.dag_id,
    });

    // 2. Failure propagation to a fixpoint. A pending node whose dependency has
    //    failed can never run, so mark it failed too (and record which dep).
    //    Loop because a freshly-failed node may cascade onto its own dependents.
    let changed = true;
    while (changed) {
      changed = false;
      const statusById: Record<string, string> = {};
      for (const node of nodes) statusById[node.node_id] = node.status;

      for (const node of nodes) {
        if (node.status !== "pending") continue;
        const failedDep = node.depends_on.find(
          (dep) => statusById[dep] === "failed",
        );
        if (failedDep !== undefined) {
          await ctx.runMutation(internal.hiveData._patchNode, {
            dag_id: args.dag_id,
            node_id: node.node_id,
            status: "failed",
            output_text: `skipped: dependency ${failedDep} failed`,
          });
          changed = true;
        }
      }

      if (changed) {
        // Re-read so the next fixpoint pass and the ready computation below see
        // the patched statuses.
        nodes = await ctx.runQuery(internal.hiveData._getNodes, {
          dag_id: args.dag_id,
        });
      }
    }

    // 3. Compute the ready set and claim-then-schedule each node.
    const statusById: Record<string, string> = {};
    for (const node of nodes) statusById[node.node_id] = node.status;

    // Adapt hive_nodes rows (node_id) into PlannedNode shape (id) for readyNodes.
    const planned: PlannedNode[] = nodes.map((node) => ({
      id: node.node_id,
      description: node.description,
      depends_on: node.depends_on,
    }));

    const readyIds = new Set<string>(readyNodes(planned, statusById));
    // Nodes explicitly parked in "ready" should also be routed.
    for (const node of nodes) {
      if (node.status === "ready") readyIds.add(node.node_id);
    }

    for (const node_id of readyIds) {
      // CLAIM before scheduling: only nodes currently pending/ready reach here,
      // and flipping to "auctioned" removes them from any future ready set.
      await ctx.runMutation(internal.hiveData._setNodeStatus, {
        dag_id: args.dag_id,
        node_id,
        status: "auctioned",
      });
      // Schedule every ready node in this same call — this is the parallelism
      // point: all currently-runnable nodes are dispatched at once.
      await ctx.scheduler.runAfter(0, internal.hiveRouter.routeNode, {
        dag_id: args.dag_id,
        node_id,
      });
    }

    // 4. Completion check. If nothing is in flight, the DAG is done.
    const counts = await ctx.runQuery(internal.hiveData._countNodesByStatus, {
      dag_id: args.dag_id,
    });
    const inFlight =
      counts.pending + counts.ready + counts.auctioned + counts.executing;
    if (inFlight === 0) {
      if (counts.complete === 0) {
        // Every node failed.
        await ctx.runMutation(internal.hiveData._setDagStatus, {
          dag_id: args.dag_id,
          status: "failed",
        });
        await ctx.runMutation(internal.tasks._setStatus, {
          task_id: dag.root_task_id,
          status: "failed",
        });
        await ctx.runMutation(internal.lifecycle.log, {
          task_id: dag.root_task_id,
          event_type: "hive_dag_failed",
          payload: { dag_id: args.dag_id },
        });
        return null;
      }

      // At least one node produced output — hand off to evaluation.
      await ctx.runMutation(internal.hiveData._setDagStatus, {
        dag_id: args.dag_id,
        status: "evaluating",
      });
      try {
        await ctx.scheduler.runAfter(0, evaluateDagRef, {
          dag_id: args.dag_id,
        });
      } catch (err) {
        console.warn("[hive-orchestrator] evaluator not yet wired", err);
      }
    }

    return null;
  },
});

export const onNodeSettled = internalAction({
  args: { task_id: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // 5. Find the hive node owning this task. Non-hive tasks have no node.
    const node = await ctx.runQuery(internal.hiveData._getNodeByTaskId, {
      task_id: args.task_id,
    });
    if (node === null) return null;
    if (node.status === "complete" || node.status === "failed") return null;

    // 6. Load the settled task and extract its material. Mirror planning.ts
    //    synthesize duck-typing for the result text + agent_id.
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    if (
      task.status !== "complete" &&
      task.status !== "disputed" &&
      task.status !== "failed" &&
      task.status !== "cancelled"
    ) {
      return null;
    }

    const resultText =
      typeof task.result === "object" && task.result && "text" in task.result
        ? (task.result as { text: string }).text
        : task.result !== undefined && task.result !== null
          ? JSON.stringify(task.result)
          : "";
    const agentId =
      typeof task.result === "object" &&
      task.result &&
      "agent_id" in task.result
        ? (task.result as { agent_id?: string }).agent_id
        : undefined;

    const verdict = task.judge_verdict as
      | { quality_score?: number }
      | undefined
      | null;
    const qualityScore =
      verdict && typeof verdict.quality_score === "number"
        ? verdict.quality_score
        : undefined;

    // Map task status -> node status.
    //   complete            -> complete
    //   disputed            -> complete (judge-rejected but still material),
    //                          UNLESS there is no result text at all -> failed
    //   failed | cancelled  -> failed
    let nodeStatus: "complete" | "failed";
    if (task.status === "complete") {
      nodeStatus = "complete";
    } else if (task.status === "disputed") {
      nodeStatus = resultText.length > 0 ? "complete" : "failed";
    } else {
      // failed, cancelled, or any other non-terminal-success status.
      nodeStatus = "failed";
    }

    const truncatedOutput = resultText.slice(0, MAX_OUTPUT_CHARS);

    await ctx.runMutation(internal.hiveData._patchNode, {
      dag_id: node.dag_id,
      node_id: node.node_id,
      status: nodeStatus,
      assigned_agent_id: agentId,
      output_text: truncatedOutput,
      eval_score: qualityScore,
    });

    // 7. On successful completion with material output, persist a scratchpad
    //    memory and kick off its embedding.
    if (nodeStatus === "complete" && truncatedOutput.length > 0) {
      const entry_id = await ctx.runMutation(internal.scratchpad._write, {
        dag_id: node.dag_id,
        node_id: node.node_id,
        task_id: args.task_id,
        agent_id: agentId ?? "unknown",
        kind: "result",
        content: truncatedOutput.slice(0, MAX_SCRATCHPAD_CHARS),
        confidence: qualityScore ?? 0.5,
      });
      await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
        entry_id,
      });

      // Also write a compact "decision" entry summarizing who executed the
      // node, at what price, and the judge's quality verdict — cheap routing
      // signal for sibling nodes' semantic recall.
      const pricePaid = task.price_paid;
      const decisionId = await ctx.runMutation(internal.scratchpad._write, {
        dag_id: node.dag_id,
        node_id: node.node_id,
        task_id: args.task_id,
        agent_id: agentId ?? "unknown",
        kind: "decision",
        content: `node ${node.node_id} executed by ${
          agentId ?? "unknown"
        } at price ${pricePaid ?? "n/a"}; judge quality ${
          qualityScore ?? "n/a"
        }`,
        confidence: 1.0,
      });
      await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
        entry_id: decisionId,
      });
    }

    // 8. Lifecycle log on the DAG's root task.
    const dag = await ctx.runQuery(internal.hiveData._getDag, {
      dag_id: node.dag_id,
    });
    if (dag !== null) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: dag.root_task_id,
        event_type: "hive_node_settled",
        payload: {
          node_id: node.node_id,
          status: nodeStatus,
          agent_id: agentId,
          quality_score: qualityScore,
        },
      });
    }

    // 9. Re-run advance to schedule any now-unblocked nodes / detect completion.
    await ctx.scheduler.runAfter(0, internal.hiveOrchestrator.advance, {
      dag_id: node.dag_id,
    });

    return null;
  },
});
