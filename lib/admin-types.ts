import type { Id } from "@/convex/_generated/dataModel";
import type { PaymentStatus, TaskStatus } from "@/lib/types";

export type AdminAction =
  | "override_judge"
  | "cancel_task"
  | "refresh_connect_account"
  | "retry_payout";

export interface AdminActionRequest {
  action: AdminAction;
  target_id: string;
  reason: string;
  payload?: {
    verdict?: "accept" | "reject";
  };
}

export interface AdminMetric {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

export interface AdminTaskSummary {
  _id: Id<"tasks">;
  posted_by: string;
  task_type: string;
  prompt: string;
  max_budget: number;
  status: TaskStatus;
  payment_status?: PaymentStatus;
  price_paid?: number;
  winning_agent_id?: string;
  judge_verdict?: unknown;
  created_at: number;
}

export interface AdminOverview {
  generated_at: number;
  totals: {
    tasks: number;
    failed_tasks: number;
    disputed_tasks: number;
    completed_tasks: number;
    credits_purchased: number;
    escrow_locked: number;
    agent_earnings_available: number;
    platform_fees: number;
    pending_payouts: number;
    failed_payouts: number;
  };
  task_counts: Array<{ status: string; count: number }>;
  payment_counts: Array<{ status: string; count: number }>;
  recent_failures: AdminTaskSummary[];
  recent_admin_events: AdminEventView[];
}

export interface AdminTasksResponse {
  tasks: AdminTaskSummary[];
}

export interface AdminPaymentsResponse {
  buyer_wallets: Array<{
    buyer_id: string;
    available_credits: number;
    reserved_credits: number;
    lifetime_purchased: number;
    lifetime_spent: number;
    updated_at: number;
  }>;
  agent_wallets: Array<{
    agent_id: string;
    available_earnings: number;
    pending_earnings: number;
    lifetime_earned: number;
    lifetime_paid_out: number;
    updated_at: number;
  }>;
  escrow: Array<{
    task_id: Id<"tasks">;
    buyer_id: string;
    seller_id: string;
    locked_amount: number;
    platform_fee?: number;
    agent_net_amount?: number;
    status: "locked" | "released" | "refunded";
  }>;
  checkout_sessions: Array<{
    buyer_id: string;
    session_id: string;
    amount_usd: number;
    credits: number;
    status: string;
    updated_at: number;
  }>;
  payout_accounts: Array<{
    agent_id: string;
    stripe_connect_account_id: string;
    onboarding_status: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements_due: string[];
    updated_at: number;
  }>;
  payouts: Array<{
    _id: Id<"payouts">;
    agent_id: string;
    amount: number;
    currency: string;
    status: string;
    stripe_transfer_id?: string;
    failure_reason?: string;
    updated_at: number;
  }>;
  ledger_entries: Array<{
    account_id: string;
    account_type: string;
    entry_type: string;
    amount: number;
    currency: string;
    task_id?: Id<"tasks">;
    stripe_event_id?: string;
    stripe_session_id?: string;
    stripe_transfer_id?: string;
    idempotency_key: string;
    created_at: number;
  }>;
}

export interface AdminAgentsResponse {
  agents: Array<{
    agent_id: string;
    display_name: string;
    sponsor: string;
    industry?: string;
    protocol?: string;
    health_status?: string;
    verification_status?: string;
    reputation_score: number;
    total_tasks_completed: number;
    total_disputes_lost: number;
    available_earnings: number;
    payouts_enabled: boolean;
    requirements_due: string[];
  }>;
}

export interface AdminEventView {
  _id: Id<"admin_events">;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  payload: unknown;
  created_at: number;
}
