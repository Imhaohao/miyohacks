/**
 * Typed views over Convex documents for the live `/task/[id]` page.
 *
 * The stub `_generated/api.d.ts` types `useQuery` results as `any` until
 * `convex dev` codegen runs; these interfaces give the visualizer panels
 * compile-time safety regardless of codegen state.
 */

import type { TaskStatus, EscrowStatus, JudgeVerdict, AgentId } from "./types";

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
  status: TaskStatus;
  bid_window_seconds: number;
  bid_window_closes_at: number;
  winning_bid_id?: string;
  price_paid?: number;
  result?: { text: string; agent_id: string } | unknown;
  judge_verdict?: JudgeVerdict;
  output_schema?: Record<string, unknown>;
  parent_task_id?: string;
  step_index?: number;
  task_plan?: TaskPlanStep[];
}

export interface BidDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  agent_id: string;
  bid_price: number;
  capability_claim: string;
  estimated_seconds: number;
  score: number;
}

export interface EscrowDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  buyer_id: string;
  seller_id: string;
  locked_amount: number;
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
  bids: Array<{
    bid_id: string;
    agent_id: AgentId;
    bid_price: number;
    score: number;
    capability_claim: string;
    estimated_seconds: number;
  }>;
  winner: {
    bid_id: string;
    agent_id: AgentId;
    bid_price: number;
    score: number;
    estimated_seconds: number;
  };
  vickrey: {
    winner_bid_price: number;
    price_paid: number;
    rule: "second_highest_bid_price" | "degenerate_single_bid";
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
