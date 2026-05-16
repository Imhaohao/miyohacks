import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  user_accounts: defineTable({
    account_id: v.string(),
    clerk_user_id: v.string(),
    token_identifier: v.optional(v.string()),
    email: v.optional(v.string()),
    display_name: v.optional(v.string()),
    avatar_url: v.optional(v.string()),
    trial_credits_granted_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_account", ["account_id"])
    .index("by_clerk_user", ["clerk_user_id"])
    .index("by_token_identifier", ["token_identifier"]),

  projects: defineTable({
    owner_account_id: v.string(),
    name: v.string(),
    product_url: v.optional(v.string()),
    github_repo_url: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_owner", ["owner_account_id"]),

  agents: defineTable({
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    agent_role: v.optional(
      v.union(
        v.literal("executive"),
        v.literal("context"),
        v.literal("executor"),
        v.literal("judge"),
      ),
    ),
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
    target_repo: v.optional(v.string()),
    target_branch: v.optional(v.string()),
    payment_status: v.optional(
      v.union(
        v.literal("unfunded"),
        v.literal("funds_reserved"),
        v.literal("escrow_locked"),
        v.literal("released"),
        v.literal("refunded"),
        v.literal("payout_pending"),
      ),
    ),
    status: v.union(
      v.literal("open"),
      v.literal("shortlisting"),
      v.literal("planning"),
      v.literal("bidding"),
      v.literal("awarded"),
      v.literal("plan_review"),
      v.literal("approved"),
      v.literal("executing"),
      v.literal("judging"),
      v.literal("synthesizing"),
      v.literal("complete"),
      v.literal("disputed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    bid_window_seconds: v.number(),
    bid_window_closes_at: v.number(),
    winning_bid_id: v.optional(v.id("bids")),
    price_paid: v.optional(v.number()),
    result: v.optional(v.any()),
    judge_verdict: v.optional(v.any()),
    project_id: v.optional(v.id("projects")),
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
    project_id: v.optional(v.id("projects")),
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

  bids: defineTable({
    task_id: v.id("tasks"),
    agent_id: v.string(),
    agent_role: v.optional(
      v.union(
        v.literal("executive"),
        v.literal("context"),
        v.literal("executor"),
        v.literal("judge"),
      ),
    ),
    bid_price: v.number(),
    capability_claim: v.string(),
    estimated_seconds: v.number(),
    score: v.number(),
    task_fit_score: v.optional(v.number()),
    historical_quality: v.optional(v.number()),
    acceptance_rate: v.optional(v.number()),
    reliability_score: v.optional(v.number()),
    speed_score: v.optional(v.number()),
    estimate_accuracy: v.optional(v.number()),
    availability_score: v.optional(v.number()),
    expected_quality: v.optional(v.number()),
    latency_penalty: v.optional(v.number()),
    effective_price: v.optional(v.number()),
    value_score: v.optional(v.number()),
    execution_preview: v.optional(v.string()),
    tool_availability: v.optional(
      v.object({
        status: v.union(
          v.literal("available"),
          v.literal("manual"),
          v.literal("mock"),
          v.literal("missing"),
        ),
        checked: v.array(v.string()),
        missing: v.optional(v.array(v.string())),
        reason: v.optional(v.string()),
        protocol: v.optional(
          v.union(
            v.literal("mcp"),
            v.literal("a2a"),
            v.literal("arbor_a2a_bridge"),
            v.literal("manual"),
            v.literal("none"),
          ),
        ),
        execution_status: v.optional(
          v.union(
            v.literal("native_mcp"),
            v.literal("native_a2a"),
            v.literal("arbor_real_adapter"),
            v.literal("needs_vendor_a2a_endpoint"),
            v.literal("mock_unconnected"),
          ),
        ),
        endpoint_host: v.optional(v.string()),
        proof: v.optional(v.string()),
      }),
    ),
  }).index("by_task", ["task_id"]),

  escrow: defineTable({
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    seller_id: v.string(),
    locked_amount: v.number(),
    platform_fee: v.optional(v.number()),
    agent_net_amount: v.optional(v.number()),
    status: v.union(
      v.literal("locked"),
      v.literal("released"),
      v.literal("refunded"),
    ),
  }).index("by_task", ["task_id"]),

  buyer_wallets: defineTable({
    buyer_id: v.string(),
    available_credits: v.number(),
    reserved_credits: v.number(),
    lifetime_purchased: v.number(),
    lifetime_granted: v.optional(v.number()),
    lifetime_spent: v.number(),
    updated_at: v.number(),
  }).index("by_buyer", ["buyer_id"]),

  agent_wallets: defineTable({
    agent_id: v.string(),
    available_earnings: v.number(),
    pending_earnings: v.number(),
    lifetime_earned: v.number(),
    lifetime_paid_out: v.number(),
    updated_at: v.number(),
  }).index("by_agent", ["agent_id"]),

  ledger_entries: defineTable({
    account_id: v.string(),
    account_type: v.union(
      v.literal("buyer"),
      v.literal("agent"),
      v.literal("platform"),
      v.literal("escrow"),
    ),
    entry_type: v.union(
      v.literal("credit_purchase"),
      v.literal("trial_credit_grant"),
      v.literal("credit_reserve"),
      v.literal("credit_release"),
      v.literal("credit_refund"),
      v.literal("escrow_release"),
      v.literal("agent_earning_available"),
      v.literal("agent_payout"),
      v.literal("agent_payout_failed"),
      v.literal("platform_fee"),
    ),
    amount: v.number(),
    currency: v.string(),
    task_id: v.optional(v.id("tasks")),
    stripe_event_id: v.optional(v.string()),
    stripe_session_id: v.optional(v.string()),
    stripe_transfer_id: v.optional(v.string()),
    idempotency_key: v.string(),
    created_at: v.number(),
  })
    .index("by_account", ["account_type", "account_id"])
    .index("by_task", ["task_id"])
    .index("by_idempotency_key", ["idempotency_key"]),

  stripe_checkout_sessions: defineTable({
    buyer_id: v.string(),
    session_id: v.string(),
    amount_usd: v.number(),
    credits: v.number(),
    status: v.union(
      v.literal("created"),
      v.literal("completed"),
      v.literal("expired"),
      v.literal("failed"),
    ),
    stripe_customer_id: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_session", ["session_id"])
    .index("by_buyer", ["buyer_id"]),

  agent_payout_accounts: defineTable({
    agent_id: v.string(),
    stripe_connect_account_id: v.string(),
    onboarding_status: v.union(
      v.literal("not_started"),
      v.literal("pending"),
      v.literal("complete"),
      v.literal("restricted"),
    ),
    charges_enabled: v.boolean(),
    payouts_enabled: v.boolean(),
    requirements_due: v.array(v.string()),
    last_checked_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_connect_account", ["stripe_connect_account_id"]),

  payouts: defineTable({
    agent_id: v.string(),
    amount: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("processing"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    stripe_transfer_id: v.optional(v.string()),
    failure_reason: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_transfer", ["stripe_transfer_id"]),

  admin_events: defineTable({
    actor: v.string(),
    action: v.string(),
    target_type: v.string(),
    target_id: v.string(),
    reason: v.string(),
    payload: v.any(),
    created_at: v.number(),
  })
    .index("by_created_at", ["created_at"])
    .index("by_target", ["target_type", "target_id"]),

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

  agent_contacts: defineTable({
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    industry: v.string(),
    agent_role: v.optional(
      v.union(
        v.literal("executive"),
        v.literal("context"),
        v.literal("executor"),
        v.literal("judge"),
      ),
    ),
    protocol: v.union(
      v.literal("a2a"),
      v.literal("mcp"),
      v.literal("mock"),
      v.literal("manual"),
    ),
    one_liner: v.string(),
    capabilities: v.array(v.string()),
    domain_tags: v.array(v.string()),
    endpoint_url: v.optional(v.string()),
    agent_card_url: v.optional(v.string()),
    auth_type: v.string(),
    auth_env: v.optional(v.string()),
    execution_status: v.optional(v.string()),
    verification_status: v.string(),
    health_status: v.string(),
    supported_input_modes: v.array(v.string()),
    supported_output_modes: v.array(v.string()),
    artifact_types: v.array(v.string()),
    cost_baseline: v.number(),
    starting_reputation: v.number(),
    homepage_url: v.optional(v.string()),
    updated_at: v.number(),
  }).index("by_agent_id", ["agent_id"]),

  agent_health_checks: defineTable({
    agent_id: v.string(),
    status: v.string(),
    checked_at: v.number(),
    latency_ms: v.optional(v.number()),
    message: v.optional(v.string()),
  }).index("by_agent", ["agent_id"]),

  agent_shortlists: defineTable({
    task_id: v.id("tasks"),
    agent_id: v.string(),
    rank: v.number(),
    score: v.number(),
    reputation_score: v.number(),
    reasons: v.array(v.string()),
    industry: v.string(),
    protocol: v.string(),
    created_at: v.number(),
  }).index("by_task", ["task_id"]),

  execution_plans: defineTable({
    task_id: v.id("tasks"),
    agent_id: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("revision_requested"),
      v.literal("cancelled"),
    ),
    plan: v.any(),
    revision_count: v.number(),
    feedback: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_task", ["task_id"]),

  approval_events: defineTable({
    task_id: v.id("tasks"),
    event_type: v.union(
      v.literal("approved"),
      v.literal("revision_requested"),
      v.literal("cancelled"),
    ),
    actor: v.string(),
    reason: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_task", ["task_id"]),

  discovered_specialists: defineTable({
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    agent_role: v.optional(
      v.union(
        v.literal("executive"),
        v.literal("context"),
        v.literal("executor"),
        v.literal("judge"),
      ),
    ),
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

  user_api_keys: defineTable({
    account_id: v.string(),
    project_id: v.optional(v.id("projects")),
    name: v.string(),
    token_hash: v.string(),
    created_at: v.number(),
    last_used_at: v.optional(v.number()),
    revoked_at: v.optional(v.number()),
  })
    .index("by_account", ["account_id"])
    .index("by_token_hash", ["token_hash"]),
});
