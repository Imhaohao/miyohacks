import { callOpenAIJSON } from "./openai";
import { buildTaskContext } from "./campaign-context";
import type {
  ExecutionPlanArtifact,
  ExecutionPlanLLMResponse,
  ExecutionPlanRequest,
  SpecialistConfig,
} from "./types";

export const EXECUTION_PLAN_JSON_SCHEMA = `Return JSON only with this shape:
{
  "title": string,
  "summary": string,
  "deliverables": [{ "title": string, "description": string, "artifact_type": string }],
  "context_required": [{ "owner": "hyperspell" | "nia" | "user" | "auction-house", "item": string, "why": string }],
  "risks": string[],
  "acceptance_criteria": string[],
  "approval_prompt": string
}`;

const PLAN_GUARDRAILS = `You are about to produce a PRE-EXECUTION approval plan, not the final deliverable.
- The buyer has not yet locked payment for execution. Do NOT claim the work is done.
- Stay strictly on the user's actual goal. If the goal is unrelated to your specialty, say so honestly and outline what context would be needed before any other agent should accept.
- Name concrete files, surfaces, data models, or APIs whenever the user's prompt or attached context implies them. Generic placeholders ("frontend", "backend", "analytics") are not acceptable when the task names a real product surface.
- Acceptance criteria must be verifiable. Risks must be specific to this task, not boilerplate.`;

export function fallbackExecutionPlan(args: {
  agent_id: string;
  prompt: string;
  estimated_seconds: number;
  revisionFeedback?: string;
}): ExecutionPlanArtifact {
  return {
    kind: "execution_plan",
    title: "Execution plan for approval",
    summary:
      "The winning executor will use the attached executive/context guidance to produce the requested deliverable after buyer approval.",
    agent_id: args.agent_id,
    user_goal: args.prompt,
    deliverables: [
      {
        title: "Final work product",
        description:
          "A concrete artifact that directly addresses the user's original request and preserves the attached business/repo context.",
        artifact_type: "markdown_report",
      },
      {
        title: "Evidence and assumptions",
        description:
          "A concise explanation of sources used, assumptions made, and follow-up actions needed.",
        artifact_type: "structured_json",
      },
    ],
    context_required: [
      {
        owner: "hyperspell",
        item: "Business context, goals, and constraints",
        why: "Keeps the specialist aligned with the buyer's product and operating reality.",
      },
      {
        owner: "nia",
        item: "Repo/docs/source context",
        why: "Prevents invented implementation details and protects existing system behavior.",
      },
      {
        owner: "auction-house",
        item: "Winning bid, budget, and acceptance criteria",
        why: "Defines the paid execution contract before external work begins.",
      },
    ],
    risks: [
      "Live external tools may require credentials or return partial data.",
      "The buyer should approve the plan before any externally visible action.",
      ...(args.revisionFeedback
        ? [`Revision feedback to address: ${args.revisionFeedback}`]
        : []),
    ],
    acceptance_criteria: [
      "Output stays on the user's actual task and does not drift into an unrelated domain.",
      "Output cites or preserves the attached context packet where relevant.",
      "Output is concrete enough for the buyer or a downstream agent to act on.",
    ],
    estimated_seconds: args.estimated_seconds,
    approval_prompt:
      "Approve this plan to release the winning executor, or request a revision with concrete feedback.",
  };
}

export function normalizeExecutionPlan(args: {
  agent_id: string;
  prompt: string;
  estimated_seconds: number;
  raw: ExecutionPlanLLMResponse;
  revisionFeedback?: string;
}): ExecutionPlanArtifact {
  const fallback = fallbackExecutionPlan(args);
  return {
    ...fallback,
    title: args.raw.title?.trim() || fallback.title,
    summary: args.raw.summary?.trim() || fallback.summary,
    deliverables:
      args.raw.deliverables
        ?.filter((item) => item.title && item.description)
        .map((item) => ({
          title: item.title ?? "Deliverable",
          description: item.description ?? "",
          artifact_type: item.artifact_type ?? "markdown_report",
        })) ?? fallback.deliverables,
    context_required:
      args.raw.context_required
        ?.filter((item) => item.owner && item.item && item.why)
        .map((item) => ({
          owner: item.owner as "hyperspell" | "nia" | "user" | "auction-house",
          item: item.item ?? "",
          why: item.why ?? "",
        })) ?? fallback.context_required,
    risks:
      args.raw.risks?.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      ) ?? fallback.risks,
    acceptance_criteria:
      args.raw.acceptance_criteria?.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      ) ?? fallback.acceptance_criteria,
    approval_prompt: args.raw.approval_prompt?.trim() || fallback.approval_prompt,
  };
}

export function buildPlanUserPrompt(
  config: SpecialistConfig,
  request: ExecutionPlanRequest,
): string {
  const lines = [
    `You (${config.agent_id}) won this Arbor auction with a $${request.bidPrice.toFixed(2)} bid and ~${request.estimatedSeconds}s estimate.`,
    "",
    buildTaskContext(request.prompt, request.taskType),
  ];
  if (request.taskContext?.trim()) {
    lines.push("", "Attached context packet (Hyperspell + Nia):", request.taskContext.trim());
  }
  if (request.revisionFeedback?.trim()) {
    lines.push(
      "",
      "Buyer requested a revision. Address this feedback directly:",
      request.revisionFeedback.trim(),
    );
  }
  lines.push("", EXECUTION_PLAN_JSON_SCHEMA);
  return lines.join("\n");
}

/**
 * Default plan() implementation: call OpenAI with the SPECIALIST'S own
 * system_prompt so the plan speaks in that agent's voice instead of Arbor's
 * generic plan-writer voice. Used when a runner does not override `plan()`.
 */
export function makeDefaultPlanFn(config: SpecialistConfig) {
  return async (
    request: ExecutionPlanRequest,
  ): Promise<ExecutionPlanLLMResponse> => {
    const systemPrompt = [config.system_prompt, "", PLAN_GUARDRAILS].join("\n");
    return await callOpenAIJSON<ExecutionPlanLLMResponse>({
      systemPrompt,
      userPrompt: buildPlanUserPrompt(config, request),
      maxTokens: 1100,
      timeoutMs: 45_000,
      retries: 0,
    });
  };
}
