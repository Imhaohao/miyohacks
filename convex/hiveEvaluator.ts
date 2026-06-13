"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { callClaudeJSON, CLAUDE_PLANNER_MODEL } from "../lib/anthropic";
import {
  detectTies,
  overallConfidence,
  parseEvaluatorResponse,
  type EvaluatorResult,
  type NodeEvaluation,
} from "../lib/hive/evaluator-core";

const LOW_CONFIDENCE_THRESHOLD = 0.55;
const CONFLICT_TIE_EPSILON = 0.05;
const OUTPUT_MAX_CHARS = 6000;
const SCRATCHPAD_DIGEST_LIMIT = 15;

const SYSTEM_PROMPT = `You are the chief evaluator for a multi-agent hive DAG.
Score each node output against that node's success criteria and the original goal.

Rules:
- Stay faithful to the agent outputs. Do not invent facts that are not present.
- Identify conflicts when two nodes make contradictory or overlapping claims.
- Synthesize one final markdown answer that directly answers the original goal.
- Output JSON only with this shape:
{
  "node_evaluations": [
    { "node_id": "...", "agent_id": "...", "score": 0.0, "verdict": "accept", "reasoning": "..." }
  ],
  "conflicts": [
    { "node_a": "...", "node_b": "...", "explanation": "..." }
  ],
  "final_answer": "..."
}`;

interface EvaluateDagSummary {
  dag_id: Id<"hive_dags">;
  confidence: number;
  escalated: boolean;
  node_count: number;
}

function truncate(value: string | undefined, maxChars: number): string {
  return (value ?? "").slice(0, maxChars);
}

function scratchpadDigest(rows: unknown[]): string {
  type ScratchpadRow = {
    agent_id?: string;
    kind?: string;
    confidence?: number;
    content?: string;
    created_at?: number;
  };
  return (rows as ScratchpadRow[])
    .filter((row) => typeof row.content === "string" && row.content.trim())
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, SCRATCHPAD_DIGEST_LIMIT)
    .map(
      (row) =>
        `- [${row.kind ?? "entry"} by ${row.agent_id ?? "unknown"}, confidence ${
          typeof row.confidence === "number" ? row.confidence.toFixed(2) : "n/a"
        }] ${truncate(row.content, 700)}`,
    )
    .join("\n");
}

function buildUserPrompt(args: {
  goal: string;
  nodes: Array<{
    node_id: string;
    description: string;
    success_criteria?: string;
    assigned_agent_id?: string;
    output_text?: string;
  }>;
  scratchpad: string;
}): string {
  const nodeBlocks = args.nodes
    .map(
      (node) => `### Node ${node.node_id}
Description: ${node.description}
Success criteria: ${node.success_criteria ?? "(none provided)"}
Assigned agent: ${node.assigned_agent_id ?? "unknown"}
Output:
${truncate(node.output_text, OUTPUT_MAX_CHARS) || "(no output)"}`,
    )
    .join("\n\n");

  return [
    `Original goal:\n${args.goal}`,
    "Node outputs:",
    nodeBlocks,
    "Shared scratchpad digest:",
    args.scratchpad || "(empty)",
  ].join("\n\n");
}

function fallbackResult(
  nodes: Array<{
    node_id: string;
    assigned_agent_id?: string;
    output_text?: string;
    eval_score?: number;
  }>,
  reason: string,
): EvaluatorResult {
  const node_evaluations: NodeEvaluation[] = nodes.map((node) => ({
    node_id: node.node_id,
    agent_id: node.assigned_agent_id ?? "unknown",
    score:
      typeof node.eval_score === "number" && Number.isFinite(node.eval_score)
        ? Math.max(0, Math.min(1, node.eval_score))
        : 0.5,
    verdict: "accept",
    reasoning: `Evaluator fallback accepted available node output: ${reason}`,
  }));
  const final_answer =
    nodes
      .map((node) => truncate(node.output_text, OUTPUT_MAX_CHARS))
      .filter((text) => text.trim().length > 0)
      .join("\n\n---\n\n") || "No node output was available to synthesize.";
  return { node_evaluations, conflicts: [], final_answer };
}

function normalizeResult(
  result: EvaluatorResult,
  nodes: Array<{
    node_id: string;
    assigned_agent_id?: string;
    eval_score?: number;
  }>,
): EvaluatorResult {
  const conflictMap = new Map<string, Set<string>>();
  for (const conflict of result.conflicts) {
    if (!conflictMap.has(conflict.node_a)) {
      conflictMap.set(conflict.node_a, new Set());
    }
    if (!conflictMap.has(conflict.node_b)) {
      conflictMap.set(conflict.node_b, new Set());
    }
    conflictMap.get(conflict.node_a)?.add(conflict.node_b);
    conflictMap.get(conflict.node_b)?.add(conflict.node_a);
  }

  const byNode = new Map(result.node_evaluations.map((ev) => [ev.node_id, ev]));
  const node_evaluations = nodes.map((node) => {
    const ev = byNode.get(node.node_id);
    const conflicts = new Set([
      ...(ev?.conflicts_with ?? []),
      ...(conflictMap.get(node.node_id) ?? []),
    ]);
    return {
      node_id: node.node_id,
      agent_id: ev?.agent_id ?? node.assigned_agent_id ?? "unknown",
      score:
        typeof ev?.score === "number" && Number.isFinite(ev.score)
          ? Math.max(0, Math.min(1, ev.score))
          : node.eval_score ?? 0.5,
      verdict: ev?.verdict ?? "accept",
      reasoning: ev?.reasoning ?? "No evaluator row returned for this node.",
      conflicts_with: conflicts.size > 0 ? Array.from(conflicts) : undefined,
    } satisfies NodeEvaluation;
  });

  return {
    ...result,
    node_evaluations,
  };
}

export const evaluateDag = internalAction({
  args: { dag_id: v.id("hive_dags") },
  returns: v.object({
    dag_id: v.id("hive_dags"),
    confidence: v.number(),
    escalated: v.boolean(),
    node_count: v.number(),
  }),
  handler: async (ctx, args): Promise<EvaluateDagSummary> => {
    const dag: Doc<"hive_dags"> | null = await ctx.runQuery(
      internal.hiveData._getDag,
      {
        dag_id: args.dag_id,
      },
    );
    if (!dag) throw new Error(`dag ${args.dag_id} not found`);
    if (
      dag.status === "complete" ||
      dag.status === "failed" ||
      dag.status === "escalated"
    ) {
      return {
        dag_id: args.dag_id,
        confidence: 0,
        escalated: dag.status === "escalated",
        node_count: 0,
      };
    }

    const nodes: Array<Doc<"hive_nodes">> = await ctx.runQuery(
      internal.hiveData._getNodes,
      {
        dag_id: args.dag_id,
      },
    );
    const scratchpadRows: unknown[] = await ctx.runQuery(
      internal.scratchpad._forDag,
      { dag_id: args.dag_id },
    );

    let evaluatorResult: EvaluatorResult;
    let fallbackReason: string | null = null;
    try {
      const raw = await callClaudeJSON<unknown>({
        model: CLAUDE_PLANNER_MODEL,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt({
          goal: dag.goal,
          nodes,
          scratchpad: scratchpadDigest(scratchpadRows),
        }),
        maxTokens: 3000,
        timeoutMs: 60_000,
        retries: 1,
      });
      const parsed = parseEvaluatorResponse(raw);
      if ("error" in parsed) {
        throw new Error(parsed.error);
      }
      evaluatorResult = normalizeResult(parsed, nodes);
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message : String(err);
      console.warn(`[hive-evaluator] fallback: ${fallbackReason}`);
      evaluatorResult = fallbackResult(nodes, fallbackReason);
    }

    const confidence = overallConfidence(evaluatorResult.node_evaluations);
    const ties = detectTies(
      evaluatorResult.node_evaluations.map((ev) => ({
        node_id: ev.node_id,
        score: ev.score,
        conflicts_with: ev.conflicts_with,
      })),
      CONFLICT_TIE_EPSILON,
    );
    const escalated = confidence < LOW_CONFIDENCE_THRESHOLD || ties.length > 0;
    const escalationReason =
      ties.length > 0
        ? `Conflicting node outputs have scores within ${CONFLICT_TIE_EPSILON}.`
        : `DAG confidence ${confidence.toFixed(2)} is below ${LOW_CONFIDENCE_THRESHOLD}.`;

    for (const ev of evaluatorResult.node_evaluations) {
      await ctx.runMutation(internal.hiveData._insertEvaluation, {
        dag_id: args.dag_id,
        node_id: ev.node_id,
        agent_id: ev.agent_id,
        score: ev.score,
        verdict: ev.verdict,
        reasoning: ev.reasoning,
        conflicts_with: ev.conflicts_with,
        judge_model: CLAUDE_PLANNER_MODEL,
      });
    }
    await ctx.runMutation(internal.hiveData._insertEvaluation, {
      dag_id: args.dag_id,
      agent_id: "hive-evaluator",
      score: confidence,
      verdict: confidence >= LOW_CONFIDENCE_THRESHOLD ? "accept" : "reject",
      reasoning:
        fallbackReason !== null
          ? `Fallback synthesis used: ${fallbackReason}`
          : "DAG-level evaluator confidence summary.",
      judge_model: CLAUDE_PLANNER_MODEL,
    });

    const uniqueAgents = new Set<string>();
    for (const node of nodes) {
      if (!node.assigned_agent_id) continue;
      const ev = evaluatorResult.node_evaluations.find(
        (row) => row.node_id === node.node_id,
      );
      if (!ev) continue;
      try {
        await ctx.runMutation(internal.agents._applyReputationDelta, {
          agent_id: node.assigned_agent_id,
          task_id: node.task_id ?? dag.root_task_id,
          delta: ev.verdict === "accept" ? 0.03 * ev.score : -0.05,
          event_type: "hive_node_evaluated",
          reasoning: ev.reasoning,
          increment_completed: ev.verdict === "accept",
          increment_disputes_lost: ev.verdict === "reject",
        });
        uniqueAgents.add(node.assigned_agent_id);
      } catch (err) {
        console.warn(
          `[hive-evaluator] reputation update failed for ${
            node.assigned_agent_id
          }: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    for (const agent_id of uniqueAgents) {
      await ctx.scheduler.runAfter(0, internal.hiveRegistry.refreshEmbedding, {
        agent_id,
      });
    }

    await ctx.runMutation(internal.hiveData._setRootResult, {
      task_id: dag.root_task_id,
      result: {
        text: evaluatorResult.final_answer,
        agent_id: "hive-evaluator",
        provenance: {
          tier: "not-a2a-yet",
          live_tools_called: false,
          fallback_reason: "hive_synthesis",
        },
      },
      judge_verdict: {
        verdict: confidence >= LOW_CONFIDENCE_THRESHOLD ? "accept" : "reject",
        reasoning: escalated
          ? escalationReason
          : "Hive DAG outputs synthesized and accepted.",
        quality_score: confidence,
      },
    });

    if (escalated) {
      await ctx.runMutation(internal.hiveData._insertEscalation, {
        dag_id: args.dag_id,
        task_id: dag.root_task_id,
        kind: ties.length > 0 ? "conflict_tie" : "low_confidence",
        reason: escalationReason,
        payload: { confidence, ties },
      });
      await ctx.runMutation(internal.hiveData._setDagStatus, {
        dag_id: args.dag_id,
        status: "escalated",
      });
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: dag.root_task_id,
        status: "disputed",
      });
    } else {
      await ctx.runMutation(internal.hiveData._setDagStatus, {
        dag_id: args.dag_id,
        status: "complete",
      });
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: dag.root_task_id,
        status: "complete",
      });
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: dag.root_task_id,
      event_type: "hive_evaluated",
      payload: {
        node_scores: evaluatorResult.node_evaluations.map((ev) => ({
          node_id: ev.node_id,
          agent_id: ev.agent_id,
          score: ev.score,
          verdict: ev.verdict,
        })),
        confidence,
        ties,
        escalated,
      },
    });

    return {
      dag_id: args.dag_id,
      confidence,
      escalated,
      node_count: nodes.length,
    };
  },
});
