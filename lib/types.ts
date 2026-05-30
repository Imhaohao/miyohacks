// Public-facing tier shown in UI and provenance.
export type SpecialistTier =
  | "native-a2a"
  | "a2a-bridge"
  | "not-a2a-yet"
  | "disabled";

// Internal tier the runner factory uses to pick a runner implementation.
// Maps to a SpecialistTier via toPublicTier() in lib/specialists/registry.ts.
export type InternalSpecialistTier =
  | "real"
  | "mcp-forwarding"
  | "a2a"
  | "a2a-bridge"
  | "mock"
  | "disabled";

export type TransportKind = "api" | "mcp" | "a2a" | "a2a-bridge" | "mock";

export type ProofLevel =
  | "none"
  | "api_call"
  | "tool_call"
  | "agent_session"
  | "pr_opened";

/**
 * Provenance record attached to every specialist output so the UI can render
 * an honest tier badge. Flows from runner.execute → _setResult → task.result.
 */
export interface SpecialistProvenance {
  tier: SpecialistTier;
  live_tools_called: boolean;
  fallback_reason?: string;
  endpoint?: string;
  transport?: TransportKind;
  proof_level?: ProofLevel;
  successful_tool_call_count?: number;
  tool_call_ids?: string[];
  external_session_id?: string;
  external_task_id?: string;
  pr_url?: string;
  pr_number?: number;
}

export interface ToolCallAuditInput {
  agent_id?: string;
  phase: "bid" | "execute" | "verify" | "pr";
  transport: TransportKind;
  provider: string;
  endpoint?: string;
  method: string;
  tool_name?: string;
  call_id?: string;
  arguments?: Record<string, unknown>;
}

export interface ToolCallAuditOutcome {
  ok: boolean;
  result_preview?: string;
  error_message?: string;
  external_session_id?: string;
  external_task_id?: string;
  pr_url?: string;
  pr_number?: number;
}

export interface ToolCallRecorder {
  record<T>(
    input: ToolCallAuditInput,
    run: () => Promise<T>,
    outcome?: (result: T) => ToolCallAuditOutcome,
  ): Promise<T>;
  successfulCallIds(): string[];
}

export interface SpecialistExecuteContext {
  task_id?: string;
  agent_id?: string;
  toolRecorder?: ToolCallRecorder;
}

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
  | "planning"
  | "bidding"
  | "awarded"
  | "executing"
  | "judging"
  | "synthesizing"
  | "complete"
  | "disputed"
  | "failed";

export type EscrowStatus = "locked" | "released" | "refunded";

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
  | "bid_received"
  | "bid_declined"
  | "auction_resolved"
  | "auction_failed"
  | "execution_started"
  | "execution_complete"
  | "execution_failed"
  | "judge_verdict"
  | "settled";

export interface BidPayload {
  bid_price: number;
  capability_claim: string;
  estimated_seconds: number;
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

export type ExecutionArtifact = CampaignLaunchArtifact;

export type SpecialistOutput = string | ExecutionArtifact;

export interface SpecialistConfig {
  agent_id: AgentId;
  display_name: string;
  sponsor: string;
  sponsor_logo?: string;
  capabilities: string[];
  system_prompt: string;
  cost_baseline: number;
  starting_reputation: number;
  one_liner: string;
  /** Execution tier — determines which runner factory is used. Required. */
  tier: InternalSpecialistTier;
  /** A2A endpoint URL (Stream C will use this). */
  a2a_endpoint?: string;
  /**
   * Optional explicit URL for this agent's card JSON. If omitted the runner
   * defaults to `${origin(a2a_endpoint)}/.well-known/agent.json`.
   */
  a2a_agent_card_url?: string;
  /**
   * Env-var name whose value is used as a bearer / API-key token when the
   * agent card requires authentication. Mirrors the existing `mcp_api_key_env`
   * convention — no derived naming from agent_id.
   */
  a2a_api_key_env?: string;
  /**
   * If set, this specialist is wired to a real remote MCP server. Bid + execute
   * are forwarded to that endpoint via an LLM-driven tool-calling loop, instead
   * of being mocked. Mark `is_verified: true` only when the URL has been
   * successfully exercised with working credentials.
   */
  mcp_endpoint?: string;
  /** Optional env var name used as a bearer token for the remote MCP server. */
  mcp_api_key_env?: string;
  /**
   * Optional extra headers sourced from env vars for remote MCP requests.
   * Shape is HTTP header name -> env var name. Values are never embedded in
   * persisted specialist config.
   */
  mcp_header_env_vars?: Record<string, string>;
  /**
   * When true, the remote MCP server enforces the Streamable-HTTP session
   * handshake: the client captures `Mcp-Session-Id` from the `initialize`
   * response and echoes it on every subsequent call. Off by default — only
   * set it for servers that reject calls without a session (e.g. InsForge).
   */
  mcp_requires_session?: boolean;
  /** True when the MCP endpoint has been successfully exercised end-to-end. */
  is_verified?: boolean;
  /** Public homepage / docs URL for the sponsor. */
  homepage_url?: string;
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

export interface SpecialistExecuteResult {
  output: SpecialistOutput;
  provenance: SpecialistProvenance;
}

export interface ProbeResult {
  status: "pass" | "fail" | "demo_lane";
  duration_ms: number;
  response_excerpt?: string;
  error_message?: string;
}

export interface SpecialistRunner {
  config: SpecialistConfig;
  /** Decide whether to bid on a task. */
  bid(prompt: string, taskType: string): Promise<SpecialistDecision>;
  /** Execute the task once awarded. Returns output + provenance. */
  execute(
    prompt: string,
    taskType: string,
    context?: SpecialistExecuteContext,
  ): Promise<SpecialistExecuteResult>;
  /** Optional liveness probe used by the A2A protocol gate. */
  probe?(taskType: string): Promise<ProbeResult>;
}
