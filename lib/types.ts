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
  | "bidding"
  | "awarded"
  | "executing"
  | "judging"
  | "complete"
  | "disputed"
  | "failed";

export type EscrowStatus = "locked" | "released" | "refunded";

export type LifecycleEventType =
  | "task_posted"
  | "context_enriched"
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

export interface SpecialistRunner {
  config: SpecialistConfig;
  /** Decide whether to bid on a task. */
  bid(prompt: string, taskType: string): Promise<SpecialistDecision>;
  /** Execute the task once awarded. */
  execute(prompt: string, taskType: string): Promise<SpecialistOutput>;
}
