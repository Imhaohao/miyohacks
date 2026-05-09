import type { ImplementationPlanArtifact, SpecialistConfig } from "./types";

export function implementationPlanFromText(args: {
  config: SpecialistConfig;
  prompt: string;
  text: string;
}): ImplementationPlanArtifact {
  const summary =
    args.text
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 260) ||
    "The winning specialist produced an implementation plan for approval.";

  return {
    kind: "implementation_plan",
    title: "Implementation Approval Plan",
    summary,
    agent_id: args.config.agent_id,
    mode: "plan_for_approval",
    user_goal: args.prompt,
    context_required: [
      {
        owner: "hyperspell",
        item: "Business goal, target segment, pricing hypothesis, and conversion definition",
        why: "The executor needs the actual business intent before changing pricing or tracking conversion.",
      },
      {
        owner: "nia",
        item: "Relevant repo files, existing Stripe checkout flow, Convex schema/functions, and dashboard components",
        why: "The executor must preserve current behavior and use existing project patterns.",
      },
      {
        owner: "user",
        item: "Approval of the plan and budget checkpoint before execution",
        why: "The next phase can touch revenue code and should only run after the human confirms scope.",
      },
    ],
    proposed_build: [
      {
        step: 1,
        title: "Retrieve and lock context",
        deliverable:
          "Use Nia/source hints to identify pricing page, checkout, Convex state, analytics, and dashboard surfaces.",
        files_or_surfaces: ["app", "components", "convex", "lib", "Stripe checkout"],
      },
      {
        step: 2,
        title: "Implement approved experiment",
        deliverable:
          "Add the pricing variant, persist assignment/conversion state, and update the dark terminal UI dashboard.",
        files_or_surfaces: ["pricing page", "Convex mutations", "dashboard"],
      },
      {
        step: 3,
        title: "Verify revenue safety",
        deliverable:
          "Confirm existing Stripe checkout still works and conversion tracking records the right events.",
        files_or_surfaces: ["Stripe flow", "conversion events", "acceptance checks"],
      },
    ],
    acceptance_criteria: [
      "The pricing variant is visible only through the experiment path.",
      "Convex stores assignment and conversion events for analysis.",
      "Dashboard shows experiment performance without breaking existing metrics.",
      "Existing Stripe checkout behavior is preserved.",
      "The UI matches the current dark terminal visual system.",
    ],
    user_questions: [
      "What exact pricing variant should be tested?",
      "What event counts as conversion: checkout click, successful payment, or paid activation?",
      "Should users be assigned deterministically or randomly per session/account?",
    ],
    payment_checkpoint: {
      required_before_execution: true,
      reason:
        "This is the plan/approval phase. Lock escrow or real payment before asking an execution agent to modify revenue-critical code.",
    },
  };
}
