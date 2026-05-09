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
  }).index("by_agent_id", ["agent_id"]),

  tasks: defineTable({
    posted_by: v.string(),
    task_type: v.string(),
    prompt: v.string(),
    output_schema: v.optional(v.any()),
    max_budget: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("bidding"),
      v.literal("awarded"),
      v.literal("executing"),
      v.literal("judging"),
      v.literal("complete"),
      v.literal("disputed"),
      v.literal("failed"),
    ),
    bid_window_seconds: v.number(),
    bid_window_closes_at: v.number(),
    winning_bid_id: v.optional(v.id("bids")),
    price_paid: v.optional(v.number()),
    result: v.optional(v.any()),
    judge_verdict: v.optional(v.any()),
  }),

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

  bids: defineTable({
    task_id: v.id("tasks"),
    agent_id: v.string(),
    bid_price: v.number(),
    capability_claim: v.string(),
    estimated_seconds: v.number(),
    score: v.number(),
  }).index("by_task", ["task_id"]),

  escrow: defineTable({
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    seller_id: v.string(),
    locked_amount: v.number(),
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
});
