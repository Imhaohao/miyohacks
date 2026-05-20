/**
 * Stripe helpers for live-money task settlement.
 *
 * The marketplace uses Stripe Connect "separate charges and transfers" — the
 * platform charges the buyer first via Checkout, then transfers the agent's
 * net to their connected account after work is accepted.
 *
 *   - https://docs.stripe.com/connect/charges
 *   - https://docs.stripe.com/connect/separate-charges-and-transfers
 *   - https://docs.stripe.com/api/transfers/create
 *
 * These helpers are designed to run from a Node-runtime Convex action; they
 * make outbound Stripe calls and then ask the caller to persist the
 * resulting ids via `api.payments._recordTransfer` / `_recordUnusedRefund`
 * / `_markPayableBlocked` / `_markTransferFailed`.
 */

import { calculateEscrowSettlement, creditsToUsd } from "./payments";
import { getStripe } from "./stripe";

/**
 * Narrow surface of the Stripe SDK we actually call. Helpers default to the
 * real client returned by `getStripe()`, but tests can pass an in-memory
 * stub here without monkey-patching the module.
 */
export interface StripeLike {
  refunds: {
    create: (args: Record<string, unknown>) => Promise<{ id: string }>;
  };
  transfers: {
    create: (args: Record<string, unknown>) => Promise<{ id: string }>;
  };
}

function resolveStripe(client?: StripeLike): StripeLike {
  return client ?? (getStripe() as unknown as StripeLike);
}

export interface LiveTaskPaymentSnapshot {
  task_id: string;
  buyer_id: string;
  agent_id?: string;
  gross_funded: number;
  clearing_price?: number;
  refunded_unused?: number;
  refunded_total?: number;
  stripe_payment_intent_id?: string;
  stripe_charge_id?: string;
  stripe_transfer_id?: string;
  transfer_group?: string;
}

export interface PayoutAccountSnapshot {
  stripe_connect_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
}

export interface PartialRefundResult {
  refunded_amount: number;
  stripe_refund_id?: string;
  skipped?: "no_unused" | "missing_charge";
}

/**
 * Refund the unused portion of a live-funded task. The buyer paid the full
 * `max_budget` up front (in integer credits, equal 1:1 to Stripe cents); once
 * the Vickrey clearing price is known, this returns the difference.
 */
export async function refundUnusedBudget(args: {
  payment: LiveTaskPaymentSnapshot;
  clearingPrice: number;
  stripe?: StripeLike;
}): Promise<PartialRefundResult> {
  const gross = Math.round(args.payment.gross_funded);
  const clearing = Math.round(args.clearingPrice);
  const unused = gross - clearing;
  if (unused <= 0) {
    return { refunded_amount: 0, skipped: "no_unused" };
  }
  const chargeId = args.payment.stripe_charge_id;
  if (!chargeId) {
    return { refunded_amount: unused, skipped: "missing_charge" };
  }
  const refund = await resolveStripe(args.stripe).refunds.create({
    charge: chargeId,
    amount: unused, // credits map 1:1 to Stripe cents
    metadata: {
      task_id: args.payment.task_id,
      reason: "arbor_partial_refund_unused_budget",
    },
  });
  return {
    refunded_amount: unused,
    stripe_refund_id: refund.id,
  };
}

export interface FullRefundResult {
  refunded_amount: number;
  stripe_refund_id?: string;
  skipped?: "missing_charge";
}

/**
 * Refund the entire remaining charge — used on auction failure or rejection
 * before any transfer has been issued.
 */
export async function refundFullTaskCharge(args: {
  payment: LiveTaskPaymentSnapshot;
  reason: string;
  stripe?: StripeLike;
}): Promise<FullRefundResult> {
  const chargeId = args.payment.stripe_charge_id;
  if (!chargeId) return { refunded_amount: 0, skipped: "missing_charge" };
  const remaining = Math.round(
    args.payment.gross_funded -
      (args.payment.refunded_unused ?? 0) -
      (args.payment.refunded_total ?? 0),
  );
  if (remaining <= 0) return { refunded_amount: 0 };
  const refund = await resolveStripe(args.stripe).refunds.create({
    charge: chargeId,
    amount: remaining, // credits map 1:1 to Stripe cents
    metadata: {
      task_id: args.payment.task_id,
      reason: args.reason,
    },
  });
  return { refunded_amount: remaining, stripe_refund_id: refund.id };
}

export interface TransferOutcome {
  /** Net amount that should be transferred to the agent. */
  agent_net: number;
  platform_fee: number;
  /** Transfer id, set only on `succeeded`. */
  stripe_transfer_id?: string;
  status: "succeeded" | "payable_blocked" | "failed";
  failure_reason?: string;
  requirements_due?: string[];
}

/**
 * Attempt the Stripe Connect transfer for an accepted task. When the agent's
 * Connect account is not payout-ready, returns `payable_blocked` so the
 * caller can stash the unpayable earning and surface it to the admin.
 */
export async function transferAgentNetOrPayable(args: {
  payment: LiveTaskPaymentSnapshot;
  agentId: string;
  payoutAccount: PayoutAccountSnapshot | null | undefined;
  stripe?: StripeLike;
}): Promise<TransferOutcome> {
  const clearing = Math.round(
    args.payment.clearing_price ?? args.payment.gross_funded,
  );
  const settlement = calculateEscrowSettlement(clearing);
  if (!args.payoutAccount || !args.payoutAccount.payouts_enabled) {
    return {
      agent_net: settlement.agentNet,
      platform_fee: settlement.platformFee,
      status: "payable_blocked",
      requirements_due: args.payoutAccount?.requirements_due ?? [],
    };
  }
  try {
    const transfer = await resolveStripe(args.stripe).transfers.create({
      amount: settlement.agentNet, // credits map 1:1 to Stripe cents
      currency: "usd",
      destination: args.payoutAccount.stripe_connect_account_id,
      transfer_group: args.payment.transfer_group ?? `task:${args.payment.task_id}`,
      metadata: {
        task_id: args.payment.task_id,
        agent_id: args.agentId,
        clearing_price_credits: String(clearing),
        clearing_price_usd: creditsToUsd(clearing).toFixed(2),
        platform_fee_credits: String(settlement.platformFee),
      },
    });
    return {
      agent_net: settlement.agentNet,
      platform_fee: settlement.platformFee,
      stripe_transfer_id: transfer.id,
      status: "succeeded",
    };
  } catch (err) {
    return {
      agent_net: settlement.agentNet,
      platform_fee: settlement.platformFee,
      status: "failed",
      failure_reason: err instanceof Error ? err.message : String(err),
    };
  }
}
