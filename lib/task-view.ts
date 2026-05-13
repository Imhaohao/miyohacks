/**
 * Typed views over Convex documents for the live `/task/[id]` page.
 *
 * The stub `_generated/api.d.ts` types `useQuery` results as `any` until
 * `convex dev` codegen runs; these interfaces give the visualizer panels
 * compile-time safety regardless of codegen state.
 */

import type {
  AgentId,
  AgentRole,
  EscrowStatus,
  ExecutionArtifact,
  ExecutionPlanArtifact,
  JudgeVerdict,
  PaymentStatus,
  TaskStatus,
} from "./types";

export interface TaskPlanStep {
  prompt: string;
  rationale: string;
  specialist_hint?: string;
}

export interface TaskDoc {
  _id: string;
  _creationTime: number;
  posted_by: string;
  task_type: string;
  prompt: string;
  max_budget: number;
  payment_status?: PaymentStatus;
  status: TaskStatus;
  bid_window_seconds: number;
  bid_window_closes_at: number;
  winning_bid_id?: string;
  price_paid?: number;
  result?: { text: string; agent_id: string; artifact?: ExecutionArtifact } | unknown;
  judge_verdict?: JudgeVerdict;
  output_schema?: Record<string, unknown>;
  parent_task_id?: string;
  step_index?: number;
  task_plan?: TaskPlanStep[];
}

export interface AgentShortlistDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  agent_id: string;
  rank: number;
  score: number;
  reputation_score: number;
  reasons: string[];
  industry: string;
  protocol: string;
}

export interface ExecutionPlanDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  agent_id: string;
  status: "pending" | "approved" | "revision_requested" | "cancelled";
  plan: ExecutionPlanArtifact;
  revision_count: number;
  feedback?: string;
  created_at: number;
  updated_at: number;
}

export interface BidDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  agent_id: string;
  agent_role?: AgentRole;
  bid_price: number;
  capability_claim: string;
  estimated_seconds: number;
  score: number;
  task_fit_score?: number;
  historical_quality?: number;
  acceptance_rate?: number;
  reliability_score?: number;
  speed_score?: number;
  estimate_accuracy?: number;
  availability_score?: number;
  expected_quality?: number;
  latency_penalty?: number;
  effective_price?: number;
  value_score?: number;
  execution_preview?: string;
  tool_availability?: {
    status: "available" | "manual" | "mock" | "missing";
    checked: string[];
    missing?: string[];
    reason?: string;
  };
}

export interface EscrowDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  buyer_id: string;
  seller_id: string;
  locked_amount: number;
  platform_fee?: number;
  agent_net_amount?: number;
  status: EscrowStatus;
}

export interface LifecycleEventDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// ─── lifecycle event payload shapes (match what convex/auctions.ts writes) ──

export interface BidReceivedPayload {
  bid_id: string;
  agent_id: AgentId;
  sponsor: string;
  capability_claim: string;
  estimated_seconds: number;
}

export interface AuctionResolvedPayload {
  bids: Array<AuctionBidSummary>;
  top_3?: Array<AuctionBidSummary>;
  support_bids?: Array<AuctionBidSummary>;
  winner: AuctionBidSummary;
  vickrey: {
    winner_bid_price: number;
    runner_up_value_score?: number;
    clearing_price?: number;
    price_paid: number;
    rule:
      | "quality_adjusted_second_price"
      | "second_highest_bid_price"
      | "degenerate_single_bid";
  };
}

export interface AuctionBidSummary {
  bid_id: string;
  agent_id: AgentId;
  agent_role?: AgentRole;
  bid_price: number;
  score: number;
  capability_claim: string;
  estimated_seconds: number;
  task_fit_score?: number;
  historical_quality?: number;
  acceptance_rate?: number;
  reliability_score?: number;
  speed_score?: number;
  estimate_accuracy?: number;
  availability_score?: number;
  expected_quality?: number;
  latency_penalty?: number;
  effective_price?: number;
  value_score?: number;
  execution_preview?: string;
  tool_availability?: {
    status: "available" | "manual" | "mock" | "missing";
    checked: string[];
    missing?: string[];
    reason?: string;
  };
}

export interface SettledPayload {
  verdict: "accept" | "reject";
  escrow: "released" | "refunded";
  seller_id: string;
  delta: number;
  new_score: number;
  price_paid?: number;
}
