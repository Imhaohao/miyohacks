import assert from "node:assert/strict";
import test from "node:test";
import { rubricVerdict } from "../lib/judge-rubrics";
import type {
  CampaignLaunchArtifact,
  ExecutionPlanArtifact,
  ImplementationPlanArtifact,
} from "../lib/types";

const CAMPAIGN_PROMPT =
  "Launch a clean-label electrolyte drink on TikTok Shop next week with a creator shortlist, outreach, sample plan, risk flags, and a 7-day plan.";
const CAMPAIGN_TASK_TYPE = "creator-campaign";

const IMPLEMENTATION_PROMPT =
  "Add a /healthz endpoint to the Next.js app and update the README with a curl example.";
const IMPLEMENTATION_TASK_TYPE = "implementation";

const GENERIC_PROMPT = "Draft a 200-word internal memo about our Q3 roadmap.";
const GENERIC_TASK_TYPE = "writing";

function goodCampaign(): CampaignLaunchArtifact {
  return {
    kind: "campaign_launch",
    title: "TikTok Shop Creator Launch Kit",
    summary: "Top creators picked from live Reacher GMV data.",
    evidence: {
      tools_used: [
        "list_shops_shops_get",
        "creators_performance_creators_performance_post",
      ],
      shops_queried: ["demo-shop"],
      performance_window: "last_30_days",
      currency: "USD",
    },
    creators: [
      {
        rank: 1,
        handle: "@hydrationhaley",
        gmv: 18420,
        units_sold: 410,
        orders: 392,
        followers: 220000,
        estimated_commission: 12.5,
        fit_reason: "Live GMV traction in clean-label wellness niche.",
      },
    ],
    outreach_drafts: [
      { handle: "@hydrationhaley", message: "Hi Haley — we'd love to send a sample kit." },
    ],
    sample_plan: [
      { task: "Ship sample kits to top 3 creators", owner: "Founder", status: "todo" },
    ],
    risk_flags: ["No medical claims allowed."],
    launch_plan: [
      { day: 1, action: "Approve creators", metric: "3 replies" },
      { day: 2, action: "Ship samples", metric: "100% tracked" },
      { day: 3, action: "Send brief", metric: "2 drafts" },
      { day: 4, action: "Compliance review", metric: "0 flags" },
      { day: 5, action: "Approve drafts", metric: "3 posts" },
      { day: 6, action: "Go live", metric: "First orders" },
      { day: 7, action: "Double down", metric: "Wave 2 picked" },
    ],
  };
}

test("rubric accepts a well-formed campaign artifact", () => {
  const verdict = rubricVerdict({
    prompt: CAMPAIGN_PROMPT,
    taskType: CAMPAIGN_TASK_TYPE,
    result: goodCampaign(),
  });
  assert.equal(verdict.verdict, "accept");
  assert.ok(verdict.quality_score >= 0.7);
  assert.deepEqual(verdict.missing, []);
});

test("rubric rejects campaign artifact missing the 7-day plan", () => {
  const partial = goodCampaign();
  partial.launch_plan = partial.launch_plan.slice(0, 3);
  const verdict = rubricVerdict({
    prompt: CAMPAIGN_PROMPT,
    taskType: CAMPAIGN_TASK_TYPE,
    result: partial,
  });
  assert.equal(verdict.verdict, "reject");
  assert.ok(verdict.missing.some((m) => m.includes("launch_plan")));
});

test("rubric rejects creator-campaign output that is just markdown", () => {
  const verdict = rubricVerdict({
    prompt: CAMPAIGN_PROMPT,
    taskType: CAMPAIGN_TASK_TYPE,
    result: "# Creator picks\n\nWe like @creatorA and @creatorB.",
  });
  assert.equal(verdict.verdict, "reject");
  assert.ok(verdict.missing.some((m) => m.includes("campaign_launch")));
});

function goodImplementationPlan(): ImplementationPlanArtifact {
  return {
    kind: "implementation_plan",
    title: "Add /healthz endpoint",
    summary: "Expose a 200-with-uptime endpoint and document it.",
    agent_id: "codex-writer",
    mode: "plan_for_approval",
    user_goal: IMPLEMENTATION_PROMPT,
    context_required: [
      {
        owner: "nia",
        item: "Existing API route conventions and process uptime helper.",
        why: "Avoid divergent route style and duplicated time helpers.",
      },
    ],
    proposed_build: [
      {
        step: 1,
        title: "Add app/healthz/route.ts",
        deliverable: "GET returns 200 with { status, uptime_ms }.",
        files_or_surfaces: ["app/healthz/route.ts"],
      },
      {
        step: 2,
        title: "Update README",
        deliverable: "Add a curl example demonstrating the endpoint.",
        files_or_surfaces: ["README.md"],
      },
    ],
    acceptance_criteria: [
      "Curl returns 200 with status=ok.",
      "README has the curl example block.",
    ],
    user_questions: ["Should uptime be process-start or container-start?"],
    payment_checkpoint: {
      required_before_execution: true,
      reason: "Repo-modifying change should be approved before paid execution.",
    },
  };
}

test("rubric accepts a complete implementation plan", () => {
  const verdict = rubricVerdict({
    prompt: IMPLEMENTATION_PROMPT,
    taskType: IMPLEMENTATION_TASK_TYPE,
    result: goodImplementationPlan(),
  });
  assert.equal(verdict.verdict, "accept");
});

test("rubric rejects implementation plan with empty context_required", () => {
  const plan = goodImplementationPlan();
  plan.context_required = [];
  const verdict = rubricVerdict({
    prompt: IMPLEMENTATION_PROMPT,
    taskType: IMPLEMENTATION_TASK_TYPE,
    result: plan,
  });
  assert.equal(verdict.verdict, "reject");
  assert.ok(verdict.missing.some((m) => m.includes("context_required")));
});

test("rubric rejects implementation plan with only one acceptance criterion", () => {
  const plan = goodImplementationPlan();
  plan.acceptance_criteria = ["Only one check."];
  const verdict = rubricVerdict({
    prompt: IMPLEMENTATION_PROMPT,
    taskType: IMPLEMENTATION_TASK_TYPE,
    result: plan,
  });
  assert.equal(verdict.verdict, "reject");
});

test("rubric accepts an execution result markdown with PR + files manifest", () => {
  const md = [
    "# Codex execution result (GitHub PR)",
    "",
    "PR: https://github.com/acme/scratch/pull/42",
    "Branch: codex/healthz <- main",
    "Files changed: 2/2",
    "",
    "## Files",
    "- modified app/healthz/route.ts (240 bytes)",
    "- modified README.md (1820 bytes)",
  ].join("\n");
  const verdict = rubricVerdict({
    prompt: IMPLEMENTATION_PROMPT,
    taskType: IMPLEMENTATION_TASK_TYPE,
    result: md,
  });
  assert.equal(verdict.verdict, "accept");
});

test("rubric rejects implementation markdown without PR or safe-skip note", () => {
  const verdict = rubricVerdict({
    prompt: IMPLEMENTATION_PROMPT,
    taskType: IMPLEMENTATION_TASK_TYPE,
    result: "I had a great chat about your healthz endpoint! Let me know if you want me to actually do it.",
  });
  assert.equal(verdict.verdict, "reject");
});

test("rubric accepts an execution_plan artifact with deliverables + acceptance", () => {
  const execPlan: ExecutionPlanArtifact = {
    kind: "execution_plan",
    title: "Add /healthz",
    summary: "Endpoint + docs.",
    agent_id: "codex-writer",
    user_goal: IMPLEMENTATION_PROMPT,
    deliverables: [
      { title: "Route handler", description: "GET /healthz", artifact_type: "code" },
    ],
    context_required: [],
    risks: ["Routing conflict"],
    acceptance_criteria: ["Returns 200"],
    estimated_seconds: 600,
    approval_prompt: "Approve the change?",
  };
  const verdict = rubricVerdict({
    prompt: IMPLEMENTATION_PROMPT,
    taskType: IMPLEMENTATION_TASK_TYPE,
    result: execPlan,
  });
  assert.equal(verdict.verdict, "accept");
});

test("rubric accepts substantive generic markdown", () => {
  const verdict = rubricVerdict({
    prompt: GENERIC_PROMPT,
    taskType: GENERIC_TASK_TYPE,
    result:
      "Q3 will prioritize platform reliability over net-new features. The infra team will land the auto-scaling work, the data team will finish the warehouse migration, and the product team will ship two iteration loops on activation. We will skip the brand refresh until Q4.",
  });
  assert.equal(verdict.verdict, "accept");
});

test("rubric rejects empty or placeholder output", () => {
  assert.equal(
    rubricVerdict({ prompt: GENERIC_PROMPT, taskType: GENERIC_TASK_TYPE, result: "" }).verdict,
    "reject",
  );
  assert.equal(
    rubricVerdict({
      prompt: GENERIC_PROMPT,
      taskType: GENERIC_TASK_TYPE,
      result: "TODO: write the memo later. As an AI language model, I cannot draft this.",
    }).verdict,
    "reject",
  );
});
