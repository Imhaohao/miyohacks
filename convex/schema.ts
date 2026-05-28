import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    capabilities: v.array(v.string()),
    system_prompt: v.string(),
    cost_per_task_estimate: v.number(),
    reputation_score: v.number(),
    total_tasks_completed: v.number(),
    total_disputes_lost: v.number(),
    agent_role: v.optional(v.string()),
  }).index("by_agent_id", ["agent_id"]),

  tasks: defineTable({
    posted_by: v.string(),
    task_type: v.string(),
    prompt: v.string(),
    output_schema: v.optional(v.any()),
    max_budget: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("planning"),
      v.literal("plan_review"),
      v.literal("bidding"),
      v.literal("awarded"),
      v.literal("executing"),
      v.literal("judging"),
      v.literal("synthesizing"),
      v.literal("complete"),
      v.literal("disputed"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    bid_window_seconds: v.number(),
    bid_window_closes_at: v.number(),
    winning_bid_id: v.optional(v.id("bids")),
    price_paid: v.optional(v.number()),
    payment_status: v.optional(v.string()),
    project_id: v.optional(v.string()),
    workflow_mode: v.optional(v.string()),
    result: v.optional(v.any()),
    judge_verdict: v.optional(v.any()),
    /**
     * If set, this task is a sub-step in a larger plan. The auction lifecycle
     * runs identically; on settle, control returns to the parent task to
     * advance to the next step or synthesize.
     */
    parent_task_id: v.optional(v.id("tasks")),
    step_index: v.optional(v.number()),
    product_context_profile_id: v.optional(v.id("product_context_profiles")),
    /**
     * Decomposition produced by the planner. Set on parent tasks only.
     * Each step describes a sub-prompt and an optional preferred specialist.
     */
    task_plan: v.optional(
      v.array(
        v.object({
          prompt: v.string(),
          rationale: v.string(),
          specialist_hint: v.optional(v.string()),
        }),
      ),
    ),
  }).index("by_parent", ["parent_task_id"]),

  product_context_profiles: defineTable({
    owner_id: v.string(),
    project_id: v.optional(v.string()),
    company_name: v.string(),
    product_url: v.optional(v.string()),
    github_repo_url: v.optional(v.string()),
    business_context: v.string(),
    repo_context: v.optional(v.string()),
    source_hints: v.array(v.string()),
    hyperspell_status: v.union(
      v.literal("not_configured"),
      v.literal("pending"),
      v.literal("seeded"),
      v.literal("failed"),
    ),
    hyperspell_error: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_owner", ["owner_id"]),

  task_contexts: defineTable({
    task_id: v.id("tasks"),
    version: v.string(),
    business: v.object({
      owner: v.string(),
      summary: v.string(),
      known_facts: v.array(v.string()),
      goals: v.array(v.string()),
      constraints: v.array(v.string()),
      open_questions: v.array(v.string()),
    }),
    repo: v.object({
      owner: v.string(),
      summary: v.string(),
      source_map: v.array(
        v.object({
          label: v.string(),
          path: v.string(),
          why: v.string(),
        }),
      ),
      retrieval_queries: v.array(v.string()),
      guardrails: v.array(v.string()),
    }),
    routing: v.object({
      owner: v.string(),
      execution_rule: v.string(),
      recommended_specialists: v.array(v.string()),
      context_contract: v.array(v.string()),
    }),
    prompt_addendum: v.string(),
    created_at: v.number(),
  }).index("by_task", ["task_id"]),

  task_intakes: defineTable({
    owner_id: v.string(),
    initial_prompt: v.string(),
    task_type: v.string(),
    max_budget: v.number(),
    output_schema: v.optional(v.any()),
    business_context: v.optional(v.string()),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("collecting"),
      v.literal("ready"),
      v.literal("posting"),
      v.literal("posted"),
      v.literal("failed"),
    ),
    final_prompt: v.optional(v.string()),
    posted_task_id: v.optional(v.id("tasks")),
    last_error: v.optional(v.string()),
    question_rounds: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_owner_id_and_status", ["owner_id", "status"])
    .index("by_posted_task_id", ["posted_task_id"]),

  task_intake_messages: defineTable({
    intake_id: v.id("task_intakes"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
    ),
    kind: v.union(
      v.literal("initial_prompt"),
      v.literal("questions"),
      v.literal("answer"),
      v.literal("final_brief"),
      v.literal("error"),
    ),
    text: v.string(),
    questions: v.optional(v.array(v.string())),
    created_at: v.number(),
  }).index("by_intake_id", ["intake_id"]),

  bids: defineTable({
    task_id: v.id("tasks"),
    agent_id: v.string(),
    agent_role: v.optional(v.string()),
    bid_price: v.number(),
    capability_claim: v.string(),
    estimated_seconds: v.number(),
    score: v.number(),
    acceptance_rate: v.optional(v.number()),
    availability_score: v.optional(v.number()),
    effective_price: v.optional(v.number()),
    estimate_accuracy: v.optional(v.number()),
    execution_preview: v.optional(v.string()),
    expected_quality: v.optional(v.number()),
    historical_quality: v.optional(v.number()),
    latency_penalty: v.optional(v.number()),
    reputation_score: v.optional(v.number()),
    reputation_source: v.optional(v.string()),
    reliability_score: v.optional(v.number()),
    speed_score: v.optional(v.number()),
    task_class: v.optional(v.string()),
    task_class_history_count: v.optional(v.number()),
    task_fit_score: v.optional(v.number()),
    tool_availability: v.optional(v.any()),
    value_score: v.optional(v.number()),
  }).index("by_task", ["task_id"]),

  escrow: defineTable({
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    seller_id: v.string(),
    locked_amount: v.number(),
    agent_net_amount: v.optional(v.number()),
    platform_fee: v.optional(v.number()),
    status: v.union(
      v.literal("locked"),
      v.literal("released"),
      v.literal("refunded"),
    ),
  }).index("by_task", ["task_id"]),

  reputation_events: defineTable({
    agent_id: v.string(),
    task_id: v.id("tasks"),
    event_type: v.string(),
    delta: v.number(),
    reasoning: v.string(),
    new_score: v.number(),
  }).index("by_agent", ["agent_id"]),

  /**
   * Per-task multi-dimensional performance record. Each completed task
   * (accepted or rejected) gets one row per agent that did the work, so we
   * can show how the specialist performed across speed, estimate accuracy,
   * judge-graded quality, and value-per-dollar — not just a single rep score.
   */
  reputation_dimensions: defineTable({
    agent_id: v.string(),
    task_id: v.id("tasks"),
    /** Wall-clock seconds between execution_started and execution_complete. */
    actual_seconds: v.number(),
    /** What the agent quoted in their bid. */
    estimated_seconds: v.number(),
    /** 1.0 = on-time or faster, 0.0 = vastly slower than estimated. */
    speed_score: v.number(),
    /** 1.0 = perfect estimate, 0.0 = wildly off. Symmetric — over and under-estimating both penalize. */
    estimate_accuracy: v.number(),
    /** Judge's quality verdict, 0..1. */
    quality_score: v.number(),
    /** Quality per dollar paid, normalized 0..1. */
    value_score: v.number(),
    /** Weighted aggregate of the four dimensions above. */
    overall: v.number(),
    /** Did the judge accept the result? */
    accepted: v.boolean(),
    bid_price: v.number(),
    price_paid: v.number(),
    created_at: v.number(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_task", ["task_id"]),

  lifecycle_events: defineTable({
    task_id: v.id("tasks"),
    event_type: v.string(),
    payload: v.any(),
    timestamp: v.number(),
  }).index("by_task", ["task_id"]),

  agent_tool_calls: defineTable({
    task_id: v.id("tasks"),
    agent_id: v.string(),
    phase: v.string(),
    transport: v.string(),
    provider: v.string(),
    endpoint_host: v.optional(v.string()),
    method: v.string(),
    tool_name: v.optional(v.string()),
    call_id: v.optional(v.string()),
    arguments_redacted: v.optional(v.any()),
    status: v.union(
      v.literal("started"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    started_at: v.number(),
    completed_at: v.optional(v.number()),
    duration_ms: v.optional(v.number()),
    error_message: v.optional(v.string()),
    result_preview: v.optional(v.string()),
    external_session_id: v.optional(v.string()),
    external_task_id: v.optional(v.string()),
    pr_url: v.optional(v.string()),
    pr_number: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_task_id", ["task_id"])
    .index("by_agent_id", ["agent_id"])
    .index("by_status", ["status"])
    .index("by_external_session_id", ["external_session_id"])
    .index("by_task_id_and_status", ["task_id", "status"]),

  discovered_specialists: defineTable({
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    capabilities: v.array(v.string()),
    system_prompt: v.string(),
    cost_baseline: v.number(),
    starting_reputation: v.number(),
    one_liner: v.string(),
    discovered_for: v.string(),
    created_at: v.number(),
    discovery_source: v.optional(
      v.union(
        v.literal("catalog"),
        v.literal("registry"),
        v.literal("synthesized"),
      ),
    ),
    mcp_endpoint: v.optional(v.string()),
    mcp_api_key_env: v.optional(v.string()),
    homepage_url: v.optional(v.string()),
    rationale: v.optional(v.string()),
  }).index("by_agent_id", ["agent_id"]),

  /**
   * Per-call persistence for the A2A market gateway at /api/a2a/market.
   * Each message/send or tasks/send creates a row keyed by `run_id`. The
   * underlying protocol task lives in the `tasks` table; this table tracks
   * the A2A-level run state separately so `tasks/get` on the market route
   * can return the same artifact shape it returned at message/send time.
   */
  a2a_task_runs: defineTable({
    run_id: v.string(),
    agent_id: v.string(),
    intent: v.optional(v.string()),
    tool: v.optional(v.string()),
    state: v.union(
      v.literal("submitted"),
      v.literal("working"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    prompt: v.string(),
    artifact: v.optional(v.any()),
    error_message: v.optional(v.string()),
    cancel_requested: v.optional(v.boolean()),
    execution_status: v.optional(v.string()),
    method: v.optional(v.string()),
    sandbox_disclosure: v.optional(v.string()),
    task_type: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_run_id", ["run_id"]),
});
