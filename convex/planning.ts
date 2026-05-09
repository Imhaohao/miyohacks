"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { SPECIALISTS } from "../lib/specialists/registry";
import { MCP_CATALOG } from "../lib/specialists/catalog";
import { callOpenAI, callOpenAIJSON } from "../lib/openai";
import { BID_WINDOW_SECONDS } from "./tasks";

const PLANNER_SYSTEM_PROMPT = `You are the planner for a general-purpose marketplace where specialist AI agents bid on tasks. The user has described a goal in plain language. Decide whether the goal is atomic (one specialist can deliver it end-to-end) or compound (it needs 2-4 distinct sub-tasks, each handled by a different specialist).

Atomic goals stay as a single auction — return { "atomic": true }.
Compound goals decompose into a chain of sub-tasks — return { "atomic": false, "steps": [...] }.

Decompose ONLY when:
1. Sub-tasks need genuinely different domain expertise (e.g. "set up Stripe in my codebase" → analyze codebase + write integration code + configure Stripe; three different real specialists).
2. The output of one step naturally feeds the next (sequential dependency).
3. Splitting will produce a materially better deliverable than a single-agent attempt.

Do NOT decompose when:
- The goal is small enough for one specialist (e.g. "draft a tweet about our launch").
- The "steps" would all be the same agent doing slightly different things.
- You'd be padding for the sake of complexity.

Each step's prompt should stand on its own — assume the executing specialist sees ONLY that step's prompt plus the context blob the marketplace injects. Reference outputs of earlier steps explicitly when needed (e.g. "Using the integration plan produced in step 1, write the actual code...").

Output JSON only:
{ "atomic": true }
OR
{
  "atomic": false,
  "steps": [
    { "prompt": "<self-contained sub-task description>", "rationale": "<why this step exists>", "specialist_hint": "<optional agent_id>" },
    ...
  ]
}

specialist_hint is optional and not enforced — it's a soft preference shown to the user. Use real agent_ids from the roster you'll be shown.`;

interface PlannerStep {
  prompt: string;
  rationale: string;
  specialist_hint?: string;
}

interface PlannerResponse {
  atomic?: boolean;
  steps?: PlannerStep[];
}

/**
 * Decide whether the task is atomic or needs decomposition. For sub-tasks
 * (parent_task_id set) we always proceed straight to the auction — children
 * don't recursively decompose.
 */
export const decompose = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });

    if (task.parent_task_id) {
      // Already a sub-task; run its auction directly.
      await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, {
        task_id: args.task_id,
      });
      await ctx.scheduler.runAfter(
        BID_WINDOW_SECONDS * 1000,
        internal.auctions.resolve,
        { task_id: args.task_id },
      );
      return;
    }

    const roster = [
      ...SPECIALISTS.map((s) => ({
        agent_id: s.agent_id,
        sponsor: s.sponsor,
        one_liner: s.one_liner,
      })),
      ...MCP_CATALOG.map((c) => ({
        agent_id: c.agent_id,
        sponsor: c.sponsor,
        one_liner: c.one_liner,
      })),
    ];

    const userPrompt = [
      `User goal:\n${task.prompt}`,
      `Budget: $${task.max_budget.toFixed(2)}`,
      "Available specialists:",
      roster
        .map((r) => `- ${r.agent_id} (${r.sponsor}): ${r.one_liner}`)
        .join("\n"),
    ].join("\n\n");

    let plan: PlannerResponse;
    try {
      plan = await callOpenAIJSON<PlannerResponse>({
        systemPrompt: PLANNER_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 800,
        timeoutMs: 18_000,
        retries: 0,
      });
    } catch (err) {
      console.warn(
        "[planner] decompose failed; treating as atomic:",
        err instanceof Error ? err.message : String(err),
      );
      plan = { atomic: true };
    }

    const steps =
      plan.atomic === false && Array.isArray(plan.steps) && plan.steps.length >= 2
        ? plan.steps
            .map((s) => ({
              prompt: typeof s.prompt === "string" ? s.prompt.trim() : "",
              rationale:
                typeof s.rationale === "string" ? s.rationale.trim() : "",
              specialist_hint:
                typeof s.specialist_hint === "string" && s.specialist_hint.trim()
                  ? s.specialist_hint.trim()
                  : undefined,
            }))
            .filter((s) => s.prompt.length > 0)
            .slice(0, 4)
        : [];

    if (steps.length < 2) {
      // Atomic — proceed with the normal auction on the parent task.
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "plan_decided",
        payload: { atomic: true, steps: [] },
      });
      await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, {
        task_id: args.task_id,
      });
      await ctx.scheduler.runAfter(
        BID_WINDOW_SECONDS * 1000,
        internal.auctions.resolve,
        { task_id: args.task_id },
      );
      return;
    }

    await ctx.runMutation(internal.tasks._setPlan, {
      task_id: args.task_id,
      plan: steps,
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "plan_decided",
      payload: { atomic: false, steps },
    });

    // Multi-step: kick off the first child auction. Subsequent ones are
    // scheduled by the settle phase as each child completes.
    await ctx.scheduler.runAfter(0, internal.planning.runStep, {
      parent_task_id: args.task_id,
      step_index: 0,
    });
  },
});

/**
 * Create the child task for `step_index` and schedule its auction. Budget
 * is split evenly across remaining steps so total spend ≤ parent budget.
 */
export const runStep = internalAction({
  args: { parent_task_id: v.id("tasks"), step_index: v.number() },
  handler: async (ctx, args) => {
    const parent = await ctx.runQuery(internal.tasks._get, {
      task_id: args.parent_task_id,
    });
    const plan = parent.task_plan ?? [];
    const step = plan[args.step_index];
    if (!step) {
      console.warn(
        "[planner] runStep called with out-of-range index",
        args.step_index,
      );
      return;
    }
    // Even split: each step gets parent_budget / total_steps so the sum can
    // never exceed the parent's budget.
    const stepBudget = Number(
      (parent.max_budget / Math.max(1, plan.length)).toFixed(2),
    );

    const stepPrompt = buildChildPrompt(parent.prompt, plan, args.step_index);

    const { child_task_id } = await ctx.runMutation(
      internal.tasks._createChild,
      {
        parent_task_id: args.parent_task_id,
        step_index: args.step_index,
        prompt: stepPrompt,
        max_budget: stepBudget,
      },
    );

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.parent_task_id,
      event_type: "step_started",
      payload: {
        step_index: args.step_index,
        child_task_id,
        step_prompt: step.prompt,
        rationale: step.rationale,
      },
    });

    await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, {
      task_id: child_task_id,
    });
    await ctx.scheduler.runAfter(
      BID_WINDOW_SECONDS * 1000,
      internal.auctions.resolve,
      { task_id: child_task_id },
    );
  },
});

/**
 * Called from the auction settle phase when a child task finishes. Either
 * advances to the next step or triggers synthesis of the parent.
 */
export const advanceOrSynthesize = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const child = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    if (!child.parent_task_id) return;

    const parent = await ctx.runQuery(internal.tasks._get, {
      task_id: child.parent_task_id,
    });
    const totalSteps = parent.task_plan?.length ?? 0;
    const nextIndex = (child.step_index ?? -1) + 1;

    if (nextIndex < totalSteps) {
      await ctx.scheduler.runAfter(0, internal.planning.runStep, {
        parent_task_id: child.parent_task_id,
        step_index: nextIndex,
      });
      return;
    }

    // All steps done — synthesize the parent.
    await ctx.scheduler.runAfter(0, internal.planning.synthesize, {
      task_id: child.parent_task_id,
    });
  },
});

const SYNTHESIZER_SYSTEM_PROMPT = `You are the synthesizer for a multi-agent marketplace. The user's goal was decomposed into N sub-tasks; each sub-task was awarded to a different specialist who produced a deliverable. Your job is to combine those sub-deliverables into ONE cohesive, immediately useful final answer for the user.

Rules:
- Stay faithful to what each specialist actually produced. Don't fabricate facts they didn't include.
- Address the user's original goal directly. Open with what was done; close with what's next, if relevant.
- Use markdown. Cross-reference between sub-deliverables where useful (e.g. "the integration code in Step 2 uses the env vars set in Step 3").
- Keep it tight. The user wants the answer, not a status report on each sub-agent.`;

export const synthesize = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const parent = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    const children = await ctx.runQuery(api.tasks.childrenOf, {
      parent_task_id: args.task_id,
    });
    const plan = parent.task_plan ?? [];

    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "synthesizing",
    });

    const childOutputs = children.map((c, i) => {
      const text =
        typeof c.result === "object" && c.result && "text" in c.result
          ? (c.result as { text: string; agent_id?: string }).text
          : JSON.stringify(c.result ?? "(no output)");
      const agent =
        typeof c.result === "object" && c.result && "agent_id" in c.result
          ? (c.result as { agent_id?: string }).agent_id
          : undefined;
      return { index: i, plan_step: plan[i], agent, text };
    });

    const userPrompt = [
      `Original user goal:\n${parent.prompt}`,
      "",
      "Sub-deliverables:",
      ...childOutputs.map(
        (c) =>
          `### Step ${c.index + 1}${c.agent ? ` — ${c.agent}` : ""}\n_Plan:_ ${c.plan_step?.rationale ?? c.plan_step?.prompt ?? ""}\n\n${c.text}`,
      ),
    ].join("\n\n");

    let synthesized: string;
    try {
      synthesized = await callOpenAI({
        systemPrompt: SYNTHESIZER_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 2000,
        timeoutMs: 60_000,
        retries: 0,
      });
    } catch (err) {
      synthesized = `Synthesis failed: ${err instanceof Error ? err.message : String(err)}\n\n${userPrompt}`;
    }

    await ctx.runMutation(internal.tasks._setResult, {
      task_id: args.task_id,
      result: { text: synthesized, agent_id: "synthesizer" },
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "execution_complete",
      payload: {
        agent_id: "synthesizer",
        length: synthesized.length,
        sub_steps: children.length,
      },
    });

    // Judge the synthesized result against the ORIGINAL user goal.
    await ctx.scheduler.runAfter(0, internal.auctions.judge, {
      task_id: args.task_id,
    });
  },
});

// ─── helpers ─────────────────────────────────────────────────────────────

function buildChildPrompt(
  parentGoal: string,
  plan: Array<{ prompt: string; rationale: string }>,
  stepIndex: number,
): string {
  const previousSteps = plan.slice(0, stepIndex);
  const lines: string[] = [
    `You are working on step ${stepIndex + 1} of ${plan.length} in a multi-agent plan.`,
    "",
    `Original user goal: ${parentGoal}`,
    "",
  ];
  if (previousSteps.length > 0) {
    lines.push("Earlier steps already completed (their outputs are in the marketplace context):");
    previousSteps.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s.prompt}`);
    });
    lines.push("");
  }
  lines.push(`Your step: ${plan[stepIndex].prompt}`);
  if (plan[stepIndex].rationale) {
    lines.push("", `Why this step matters: ${plan[stepIndex].rationale}`);
  }
  return lines.join("\n");
}
