import { callOpenAI, callOpenAIJSON } from "../openai";
import type {
  ImplementationPlanArtifact,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistRunner,
  BidPayload,
  DeclineDecision,
  SpecialistOutput,
} from "../types";
import { buildTaskContext, isImplementationTask } from "../campaign-context";

const VICKREY_PRELUDE = `You are participating in a Vickrey second-price sealed-bid auction. The price you actually pay if you win is set by the second-highest bidder, not your own bid. Your dominant strategy is therefore to bid your true cost. Bidding lower than your true cost risks winning at a loss. Bidding higher than true cost reduces your win probability without increasing your profit. Bid honestly.`;

interface BidLLMResponse {
  decline?: boolean;
  reason?: string;
  bid_price?: number;
  capability_claim?: string;
  estimated_seconds?: number;
}

interface ImplementationPlanResponse {
  title?: string;
  summary?: string;
  context_required?: Array<{
    owner?: "hyperspell" | "nia" | "user" | "auction-house";
    item?: string;
    why?: string;
  }>;
  proposed_build?: Array<{
    step?: number;
    title?: string;
    deliverable?: string;
    files_or_surfaces?: string[];
  }>;
  acceptance_criteria?: string[];
  user_questions?: string[];
}

function fallbackPlan(
  config: SpecialistConfig,
  prompt: string,
): ImplementationPlanArtifact {
  const lower = prompt.toLowerCase();
  const isPricingExperiment =
    lower.includes("pricing") &&
    lower.includes("convex") &&
    lower.includes("stripe");

  if (isPricingExperiment) {
    return {
      kind: "implementation_plan",
      title: "SaaS Pricing Experiment Approval Plan",
      summary:
        "Plan a revenue-safe pricing-page experiment: add a new variant, persist assignments and conversion events in Convex, update the dashboard, and preserve the existing Stripe checkout path while matching the dark terminal UI.",
      agent_id: config.agent_id,
      mode: "plan_for_approval",
      user_goal: prompt,
      context_required: [
        {
          owner: "hyperspell",
          item: "Pricing hypothesis, target customer segment, and conversion definition",
          why: "The experiment should optimize the business goal, not merely add UI.",
        },
        {
          owner: "nia",
          item: "Pricing page component, existing Stripe checkout call path, Convex schema/functions, and dashboard metric components",
          why: "The executor must preserve revenue flow and reuse existing project patterns.",
        },
        {
          owner: "auction-house",
          item: "Approved winner, budget, acceptance criteria, and plan revision history",
          why: "The execution agent needs an auditable contract before touching revenue-critical code.",
        },
      ],
      proposed_build: [
        {
          step: 1,
          title: "Map current pricing and checkout flow",
          deliverable:
            "Use Nia/source hints to locate pricing UI, Stripe checkout creation/link handling, Convex task/state conventions, and dashboard components. Mark the exact checkout path as protected.",
          files_or_surfaces: [
            "app/** pricing route",
            "components/** pricing cards",
            "lib/** Stripe helpers",
            "convex/** schema/functions",
          ],
        },
        {
          step: 2,
          title: "Add Convex experiment state",
          deliverable:
            "Add an experiment assignment table or fields for visitor/user id, variant key, assigned_at, converted_at, checkout_session_id, and source task id; expose mutations for assignment and conversion tracking plus a query for dashboard aggregates.",
          files_or_surfaces: [
            "convex/schema.ts",
            "convex/pricingExperiments.ts",
            "generated Convex API",
          ],
        },
        {
          step: 3,
          title: "Implement pricing variant without breaking Stripe",
          deliverable:
            "Render control vs. new pricing variant in the dark terminal UI. Keep the existing Stripe checkout function/button behavior intact; only pass through the existing price/checkout identifier after assignment is recorded.",
          files_or_surfaces: [
            "pricing page",
            "pricing card component",
            "Stripe checkout trigger",
          ],
        },
        {
          step: 4,
          title: "Track conversion and update dashboard",
          deliverable:
            "Record checkout-click and successful-conversion events, then show impressions, checkout starts, conversions, and conversion rate by variant in the dashboard.",
          files_or_surfaces: [
            "dashboard route/component",
            "Convex aggregate query",
            "conversion event mutation",
          ],
        },
        {
          step: 5,
          title: "Verify revenue safety and UI fit",
          deliverable:
            "Test assignment persistence, conversion recording, dashboard refresh, and existing Stripe checkout. Compare screenshots against the current dark terminal visual language.",
          files_or_surfaces: [
            "typecheck/build",
            "manual checkout smoke path",
            "projector demo page",
          ],
        },
      ],
      acceptance_criteria: [
        "A visitor/account receives a stable control or variant assignment stored in Convex.",
        "The new pricing variant is visible and styled in the existing dark terminal UI.",
        "Existing Stripe checkout still opens or redirects exactly as before for the selected plan.",
        "Convex records checkout-start and conversion events with variant attribution.",
        "Dashboard displays per-variant impressions, checkout starts, conversions, and conversion rate.",
        "No creator/TikTok/Reacher campaign artifact appears for this software task.",
      ],
      user_questions: [
        "What exact price/package copy should the new variant test?",
        "Should assignment be anonymous per browser session or stable per signed-in account?",
        "Is conversion defined as checkout click, successful Stripe session completion, or paid activation?",
      ],
      payment_checkpoint: {
        required_before_execution: true,
        reason:
          "This is a revenue-sensitive software change. The user should approve this plan and lock escrow/payment before an execution agent modifies pricing, analytics, or Stripe-adjacent code.",
      },
    };
  }

  return {
    kind: "implementation_plan",
    title: "Implementation Plan",
    summary:
      "The winning specialist produced a scoped plan for approval before paid execution.",
    agent_id: config.agent_id,
    mode: "plan_for_approval",
    user_goal: prompt,
    context_required: [
      {
        owner: "hyperspell",
        item: "Business goal, target user segment, and success metric",
        why: "Prevents the executor from optimizing the wrong workflow.",
      },
      {
        owner: "nia",
        item: "Relevant repo files, API contracts, and existing UI patterns",
        why: "Prevents invented code paths and protects existing behavior.",
      },
    ],
    proposed_build: [
      {
        step: 1,
        title: "Map current implementation",
        deliverable: "Identify files, state, and integrations touched by the request.",
        files_or_surfaces: ["Nia source map required"],
      },
      {
        step: 2,
        title: "Implement narrow product change",
        deliverable: "Build the requested variant while preserving existing flows.",
        files_or_surfaces: ["Frontend", "Convex backend", "analytics/dashboard"],
      },
      {
        step: 3,
        title: "Verify and hand off",
        deliverable: "Run checks, summarize risks, and provide acceptance evidence.",
        files_or_surfaces: ["tests", "demo URL", "conversion dashboard"],
      },
    ],
    acceptance_criteria: [
      "The plan directly matches the user's request.",
      "Existing critical flows are preserved.",
      "State, tracking, and UI changes have explicit verification steps.",
    ],
    user_questions: [
      "Which repo branch or deployment should the executor target?",
      "What counts as a successful conversion for this experiment?",
    ],
    payment_checkpoint: {
      required_before_execution: true,
      reason:
        "This artifact is the approval plan. Escrow/payment should be locked before an execution agent makes changes or spends external API credits.",
    },
  };
}

function normalizePlan(
  config: SpecialistConfig,
  prompt: string,
  raw: ImplementationPlanResponse,
): ImplementationPlanArtifact {
  const fallback = fallbackPlan(config, prompt);
  return {
    ...fallback,
    title: raw.title?.trim() || fallback.title,
    summary: raw.summary?.trim() || fallback.summary,
    context_required:
      raw.context_required
        ?.filter((item) => item.item && item.why && item.owner)
        .map((item) => ({
          owner: item.owner as "hyperspell" | "nia" | "user" | "auction-house",
          item: item.item ?? "",
          why: item.why ?? "",
        })) ?? fallback.context_required,
    proposed_build:
      raw.proposed_build
        ?.filter((step) => step.title && step.deliverable)
        .map((step, index) => ({
          step: typeof step.step === "number" ? step.step : index + 1,
          title: step.title ?? `Step ${index + 1}`,
          deliverable: step.deliverable ?? "",
          files_or_surfaces: Array.isArray(step.files_or_surfaces)
            ? step.files_or_surfaces.filter((v): v is string => typeof v === "string")
            : [],
        })) ?? fallback.proposed_build,
    acceptance_criteria:
      raw.acceptance_criteria?.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      ) ?? fallback.acceptance_criteria,
    user_questions:
      raw.user_questions?.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      ) ?? fallback.user_questions,
  };
}

/**
 * Default specialist runner: uses OpenAI to imitate the sponsor product behavior
 * (mock). Real sponsor integrations should replace this with a sponsor-specific
 * implementation in their own file.
 */
export function makeMockSpecialist(config: SpecialistConfig): SpecialistRunner {
  return {
    config,
    async bid(prompt, taskType): Promise<SpecialistDecision> {
      const systemPrompt = `${config.system_prompt}\n\n${VICKREY_PRELUDE}\n\nYour cost baseline for a typical task is $${config.cost_baseline.toFixed(
        2,
      )}. Adjust up or down by task complexity but keep it honest.\n\nIMPORTANT: This marketplace handles tasks across every domain — payments, design, code, research, marketing, ops, anything. Decline if the user's goal is outside your real domain. Don't try to translate the goal into your specialty; if a payments task lands in front of a creator-marketing agent, decline. Your capability_claim must address the user's actual goal, not your generic specialty pitch.\n\nRespond with JSON only, one of:\n{ "decline": true, "reason": "<short reason>" }\nOR\n{ "bid_price": <number>, "capability_claim": "<one sentence about how you would do this specific task>", "estimated_seconds": <integer> }`;

      const userPrompt = `${buildTaskContext(prompt, taskType)}\n\nDo you want to bid? Bid only if your specialty actually fits this task.`;
      const data = await callOpenAIJSON<BidLLMResponse>({
        systemPrompt,
        userPrompt,
        maxTokens: 256,
        timeoutMs: 10_000,
        retries: 0,
      });

      if (data.decline) {
        const decline: DeclineDecision = {
          decline: true,
          reason: data.reason ?? "Capability mismatch",
        };
        return decline;
      }

      if (
        typeof data.bid_price !== "number" ||
        typeof data.capability_claim !== "string" ||
        typeof data.estimated_seconds !== "number"
      ) {
        // Coerce minimum viable bid from the cost baseline if the model returned a malformed object.
        const bid: BidPayload = {
          bid_price: config.cost_baseline,
          capability_claim: config.one_liner,
          estimated_seconds: 30,
        };
        return bid;
      }

      const bid: BidPayload = {
        bid_price: Math.max(0.01, Number(data.bid_price.toFixed(2))),
        capability_claim: data.capability_claim,
        estimated_seconds: Math.max(1, Math.floor(data.estimated_seconds)),
      };
      return bid;
    },

    async execute(prompt, taskType): Promise<SpecialistOutput> {
      if (isImplementationTask(prompt, taskType)) {
        const systemPrompt = `${config.system_prompt}\n\nYou were picked to PLAN a software/product implementation, not to claim the work is already done. Return JSON only. The plan is for user approval and payment/escrow before execution. It must directly match the user's actual goal and preserve Hyperspell business context plus Nia repo/source context.`;
        const userPrompt = `${buildTaskContext(prompt, taskType)}\n\nReturn JSON with this exact shape: { "title": string, "summary": string, "context_required": [{ "owner": "hyperspell" | "nia" | "user" | "auction-house", "item": string, "why": string }], "proposed_build": [{ "step": number, "title": string, "deliverable": string, "files_or_surfaces": string[] }], "acceptance_criteria": string[], "user_questions": string[] }`;
        try {
          const raw = await callOpenAIJSON<ImplementationPlanResponse>({
            systemPrompt,
            userPrompt,
            maxTokens: 1200,
            timeoutMs: 60_000,
            retries: 0,
          });
          return normalizePlan(config, prompt, raw);
        } catch {
          return fallbackPlan(config, prompt);
        }
      }
      const systemPrompt = `${config.system_prompt}\n\nYou were picked for this task. Produce a complete, useful work product in markdown that directly addresses the user's actual goal — not your specialty's generic deliverables. If the goal is to set up Stripe Connect, give them an integration plan; if it's to design a landing page, give them a design; don't pivot to creator shortlists unless that's literally the goal. Stay in character as ${config.display_name}.`;
      const userPrompt = buildTaskContext(prompt, taskType);
      return await callOpenAI({
        systemPrompt,
        userPrompt,
        maxTokens: 1500,
        timeoutMs: 60_000,
        retries: 0,
      });
    },
  };
}
