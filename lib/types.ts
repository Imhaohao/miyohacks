/**
 * Static sponsor agents shipped in the registry. Discovered specialists use
 * arbitrary kebab-case ids, so the broader `AgentId` type is just `string`.
 */
export type KnownAgentId =
  | "nia-context"
  | "hyperspell-brain"
  | "tensorlake-exec"
  | "codex-writer"
  | "devin-engineer"
  | "reacher-social"
  | "vercel-v0"
  | "insforge-backend"
  | "aside-browser"
  | "convex-realtime";

export type AgentId = KnownAgentId | (string & {});

export type TaskStatus =
  | "open"
  | "shortlisting"
  | "planning"
  | "bidding"
  | "awarded"
  | "plan_review"
  | "approved"
  | "executing"
  | "judging"
  | "synthesizing"
  | "complete"
  | "disputed"
  | "failed"
  | "cancelled";

export type EscrowStatus = "locked" | "released" | "refunded";

export type PaymentStatus =
  | "unfunded"
  | "funds_reserved"
  | "escrow_locked"
  | "released"
  | "refunded"
  | "payout_pending";

export type AgentIndustry =
  | "software"
  | "finance"
  | "legal"
  | "healthcare"
  | "ecommerce"
  | "marketing"
  | "sales"
  | "operations"
  | "data"
  | "creative-media";

export type AgentProtocol = "a2a" | "mcp" | "mock" | "manual";
export type AgentRole = "executive" | "context" | "executor" | "judge";
export type AgentExecutionStatus =
  | "native_mcp"
  | "native_a2a"
  | "arbor_real_adapter"
  | "needs_vendor_a2a_endpoint"
  | "mock_unconnected";

export type AgentHealthStatus =
  | "unknown"
  | "healthy"
  | "degraded"
  | "unreachable"
  | "auth_required";

export type AgentVerificationStatus =
  | "verified"
  | "configured"
  | "unverified"
  | "mock";

export interface AgentContact {
  agent_id: AgentId;
  display_name: string;
  sponsor: string;
  industry: AgentIndustry;
  agent_role?: AgentRole;
  protocol: AgentProtocol;
  one_liner: string;
  capabilities: string[];
  domain_tags: string[];
  endpoint_url?: string;
  agent_card_url?: string;
  auth_type: "none" | "api_key" | "oauth" | "manual";
  auth_env?: string;
  execution_status: AgentExecutionStatus;
  verification_status: AgentVerificationStatus;
  health_status: AgentHealthStatus;
  supported_input_modes: string[];
  supported_output_modes: string[];
  artifact_types: string[];
  cost_baseline: number;
  starting_reputation: number;
  homepage_url?: string;
}

export interface BrokeredAgentContact {
  contact: AgentContact;
  rank: number;
  score: number;
  reputation_score: number;
  reasons: string[];
}

export type LifecycleEventType =
  | "task_posted"
  | "context_enriched"
  | "hyperspell_business_context_started"
  | "hyperspell_business_context_added"
  | "hyperspell_business_context_skipped"
  | "nia_repo_context_started"
  | "nia_repo_context_added"
  | "nia_repo_context_skipped"
  | "context_enrichment_skipped"
  | "shortlist_started"
  | "shortlist_ready"
  | "shortlist_failed"
  | "bid_received"
  | "bid_declined"
  | "auction_resolved"
  | "auction_choice_selected"
  | "auction_failed"
  | "execution_plan_started"
  | "execution_plan_ready"
  | "execution_plan_revision_requested"
  | "execution_plan_approved"
  | "task_cancelled"
  | "payment_reserved"
  | "escrow_locked"
  | "payment_refunded"
  | "payment_released"
  | "execution_started"
  | "execution_complete"
  | "codex_pr_opened"
  | "execution_failed"
  | "judge_verdict"
  | "settled";

export interface BidPayload {
  bid_price: number;
  capability_claim: string;
  estimated_seconds: number;
  agent_role?: AgentRole;
  execution_preview?: string;
  tool_availability?: {
    status: "available" | "manual" | "mock" | "missing";
    checked: string[];
    missing?: string[];
    reason?: string;
    protocol?: "mcp" | "a2a" | "arbor_a2a_bridge" | "manual" | "none";
    execution_status?: AgentExecutionStatus;
    endpoint_host?: string;
    proof?: string;
  };
}

export interface DeclineDecision {
  decline: true;
  reason: string;
}

export type SpecialistDecision = BidPayload | DeclineDecision;

export interface JudgeVerdict {
  verdict: "accept" | "reject";
  reasoning: string;
  quality_score: number;
}

export interface CampaignLaunchCreator {
  rank: number;
  handle: string;
  gmv: number;
  units_sold: number;
  orders: number;
  followers: number;
  estimated_commission: number;
  fit_reason: string;
}

export interface CampaignLaunchArtifact {
  kind: "campaign_launch";
  title: string;
  summary: string;
  evidence: {
    tools_used: string[];
    shops_queried: string[];
    performance_window: string;
    currency: string;
  };
  creators: CampaignLaunchCreator[];
  outreach_drafts: Array<{
    handle: string;
    message: string;
  }>;
  sample_plan: Array<{
    task: string;
    owner: string;
    status: "todo" | "ready" | "blocked";
  }>;
  risk_flags: string[];
  launch_plan: Array<{
    day: number;
    action: string;
    metric: string;
  }>;
}

export interface ImplementationPlanArtifact {
  kind: "implementation_plan";
  title: string;
  summary: string;
  agent_id: string;
  mode: "plan_for_approval";
  user_goal: string;
  context_required: Array<{
    owner: "hyperspell" | "nia" | "user" | "auction-house";
    item: string;
    why: string;
  }>;
  proposed_build: Array<{
    step: number;
    title: string;
    deliverable: string;
    files_or_surfaces: string[];
  }>;
  acceptance_criteria: string[];
  user_questions: string[];
  payment_checkpoint: {
    required_before_execution: boolean;
    reason: string;
  };
}

export type ExecutionPlanSource =
  | "specialist_runner"
  | "default_llm"
  | "fallback_generic";

export interface ExecutionPlanProvenance {
  source: ExecutionPlanSource;
  agent_id: string;
  execution_status: AgentExecutionStatus;
  probe_status: "available" | "missing_auth" | "not_configured" | "unreachable" | "skipped";
  note?: string;
}

export interface ExecutionPlanArtifact {
  kind: "execution_plan";
  title: string;
  summary: string;
  agent_id: string;
  user_goal: string;
  deliverables: Array<{
    title: string;
    description: string;
    artifact_type: string;
  }>;
  context_required: Array<{
    owner: "hyperspell" | "nia" | "user" | "auction-house";
    item: string;
    why: string;
  }>;
  risks: string[];
  acceptance_criteria: string[];
  estimated_seconds: number;
  approval_prompt: string;
  produced_by?: ExecutionPlanProvenance;
}

export type ExecutionArtifact =
  | CampaignLaunchArtifact
  | ImplementationPlanArtifact
  | ExecutionPlanArtifact;

export type SpecialistOutput = string | ExecutionArtifact;

export interface SpecialistConfig {
  agent_id: AgentId;
  display_name: string;
  sponsor: string;
  sponsor_logo?: string;
  agent_role?: AgentRole;
  capabilities: string[];
  system_prompt: string;
  cost_baseline: number;
  starting_reputation: number;
  one_liner: string;
  industry?: AgentIndustry;
  protocol?: AgentProtocol;
  /**
   * If set, this specialist is wired to a real remote MCP server. Bid + execute
   * are forwarded to that endpoint via an LLM-driven tool-calling loop, instead
   * of being mocked. Mark `is_verified: true` only when the URL has been
   * successfully exercised with working credentials.
   */
  mcp_endpoint?: string;
  /** Optional env var name used as a bearer token for the remote MCP server. */
  mcp_api_key_env?: string;
  /** True when the MCP endpoint has been successfully exercised end-to-end. */
  is_verified?: boolean;
  /** Public homepage / docs URL for the sponsor. */
  homepage_url?: string;
  /** Optional A2A endpoints. Sponsor runners decline when unavailable. */
  a2a_agent_card_url?: string;
  a2a_endpoint?: string;
  auth_type?: "none" | "api_key" | "oauth" | "manual";
  execution_status?: AgentExecutionStatus;
  health_status?: AgentHealthStatus;
  verification_status?: AgentVerificationStatus;
  /**
   * Set on specialists added at runtime by the discovery flow instead of
   * being hand-authored sponsors.
   */
  discovered?: boolean;
  /**
   * Where the discovered specialist came from:
   *   - "catalog"      → curated list of known production HTTP MCP servers
   *   - "registry"     → live search against an MCP registry
   *   - "synthesized"  → LLM-designed in-persona agent (no real MCP backend)
   */
  discovery_source?: "catalog" | "registry" | "synthesized";
  /** Free-form note explaining what query triggered discovery. */
  discovered_for?: string;
}

export interface ExecutionPlanLLMResponse {
  title?: string;
  summary?: string;
  deliverables?: Array<{
    title?: string;
    description?: string;
    artifact_type?: string;
  }>;
  context_required?: Array<{
    owner?: "hyperspell" | "nia" | "user" | "auction-house";
    item?: string;
    why?: string;
  }>;
  risks?: string[];
  acceptance_criteria?: string[];
  approval_prompt?: string;
}

export interface ExecutionPlanRequest {
  prompt: string;
  taskType: string;
  taskContext?: string;
  revisionFeedback?: string;
  estimatedSeconds: number;
  bidPrice: number;
}

export interface SpecialistExecuteOpts {
  task_id?: string;
  target_repo?: string;
  target_branch?: string;
  acceptance_criteria?: string[];
}

export interface SpecialistRunner {
  config: SpecialistConfig;
  /** Decide whether to bid on a task. */
  bid(prompt: string, taskType: string): Promise<SpecialistDecision>;
  /** Execute the task once awarded. */
  execute(
    prompt: string,
    taskType: string,
    opts?: SpecialistExecuteOpts,
  ): Promise<SpecialistOutput>;
  /**
   * Produce a buyer-approval plan in this specialist's voice. Optional; when
   * absent, the orchestrator falls back to a default LLM call using the
   * specialist's own system_prompt.
   */
  plan?(request: ExecutionPlanRequest): Promise<ExecutionPlanLLMResponse>;
}
