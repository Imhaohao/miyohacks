/**
 * Money primitives for Arbor.
 *
 * Single source of truth: **1 credit = 1 cent of USD**. Every amount on the
 * wire, in storage, in escrow, in bids, and in ledger entries is an integer
 * number of credits. The UI converts to dollars only at the display layer.
 *
 * Rationale: keeping credits integer eliminates an entire class of rounding
 * bugs that the previous decimal-USD model had (escrow settlement that didn't
 * sum, half-cent platform fees, drifting balances after refunds). Stripe's
 * own `unit_amount` is integer cents, so this also collapses one conversion
 * step at the Stripe boundary.
 */

export const CREDITS_PER_USD = 100;

export const PLATFORM_FEE_BPS = 1000; // 10.00% expressed in basis points

/** @deprecated Use `PLATFORM_FEE_BPS` (basis-points integer) for new code. */
export const PLATFORM_FEE_RATE = PLATFORM_FEE_BPS / 10000;

export const CREDIT_CURRENCY = "USD";

/** Every new account starts with this many credits ($5.00 of free trial). */
export const FREE_TRIAL_CREDITS = 500;

/**
 * Fixed purchase units in the billing UI. `credits` is what lands in the
 * wallet; `amountUsd` is the gross price charged by Stripe and shown on the
 * receipt. They map 1:1 today (100 credits per $1) but stay separate fields
 * so a future promo can sell, e.g., 1100 credits for $10 without contorting
 * the math.
 */
export const CREDIT_PACKS = [
  { credits: 1000, amountUsd: 10, label: "Starter" },
  { credits: 2500, amountUsd: 25, label: "Builder" },
  { credits: 10000, amountUsd: 100, label: "Scale" },
  { credits: 25000, amountUsd: 250, label: "Marketplace" },
] as const;

export type CreditPack = (typeof CREDIT_PACKS)[number];

// --- Conversions ----------------------------------------------------------

/** USD (decimal dollars) → integer credits. Rounds half-up. */
export function usdToCredits(usd: number): number {
  return Math.round(usd * CREDITS_PER_USD);
}

/** Integer credits → USD decimal dollars (precise to the cent). */
export function creditsToUsd(credits: number): number {
  return Math.round(credits) / CREDITS_PER_USD;
}

// --- Formatting -----------------------------------------------------------

/** "500 credits" — integer, no trailing decimal. */
export function formatCredits(credits: number): string {
  const rounded = Math.round(credits);
  return `${rounded.toLocaleString("en-US")} credits`;
}

/** "$5.00" — two-decimal USD. */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Buyer-facing rendering of a credit amount as dollars: "$5.00". */
export function formatCreditsAsUsd(credits: number): string {
  return formatUsd(creditsToUsd(credits));
}

// --- Pack lookup ----------------------------------------------------------

export function creditPackForCredits(credits: number): CreditPack | null {
  return CREDIT_PACKS.find((pack) => pack.credits === credits) ?? null;
}

// --- Fees / settlement (all integer math) ---------------------------------

export function calculatePlatformFee(credits: number): number {
  // Round half-up so the platform never under-collects fractional credits.
  // For a 10% fee, this means a 7-credit bid yields a 1-credit fee
  // (0.7 → 1), a 14-credit bid yields a 1-credit fee (1.4 → 1), etc.
  return Math.round((credits * PLATFORM_FEE_BPS) / 10000);
}

export function calculateAgentNet(credits: number): number {
  return Math.max(0, Math.round(credits) - calculatePlatformFee(credits));
}

export function calculateEscrowSettlement(credits: number): {
  gross: number;
  platformFee: number;
  agentNet: number;
} {
  const gross = Math.round(credits);
  const platformFee = calculatePlatformFee(gross);
  const agentNet = gross - platformFee;
  return { gross, platformFee, agentNet };
}

// --- Deprecated USD-domain helpers ---------------------------------------
//
// These predate the integer-credit refactor; they still operate in **dollars
// in / cents out** so any callsite that hasn't migrated yet keeps working.
// New code should use `usdToCredits` / `creditsToUsd` / `formatCreditsAsUsd`
// instead and read amounts as integer credits, not decimal dollars.

/** @deprecated Use integer credits + `creditsToUsd` for display. */
export function roundMoney(usd: number): number {
  return Math.round((usd + Number.EPSILON) * 100) / 100;
}

/** @deprecated Pass integer credits to Stripe directly. */
export function amountToCents(usd: number): number {
  return Math.round(roundMoney(usd) * 100);
}

/** @deprecated Storage is integer credits; no cents→dollar step needed. */
export function centsToAmount(cents: number): number {
  return roundMoney(cents / 100);
}

// --- Stripe metadata ------------------------------------------------------

export function checkoutMetadata(args: {
  buyerId: string;
  credits: number;
  clerkUserId?: string;
}): Record<string, string> {
  return {
    buyer_id: args.buyerId,
    account_id: args.buyerId,
    ...(args.clerkUserId ? { clerk_user_id: args.clerkUserId } : {}),
    credits: String(args.credits),
    product: "arbor_credits",
  };
}

export const ARBOR_TASK_FUNDING_PRODUCT = "arbor_task_funding";

/**
 * Metadata stamped onto the Stripe Checkout Session + PaymentIntent for a
 * live-money task. The webhook keys off `product` and `task_id` to find the
 * matching task and `transfer_group` to issue the eventual Connect transfer.
 *
 * NOTE: `maxBudget` is still passed as decimal USD here for backwards
 * compatibility with the credits-checkout route; Split 2 of the
 * integer-credit refactor will swap this to integer credits.
 */
export function taskFundingCheckoutMetadata(args: {
  buyerId: string;
  taskId: string;
  maxBudget: number;
  transferGroup: string;
  clerkUserId?: string;
  projectId?: string;
  taskType?: string;
}): Record<string, string> {
  return {
    product: ARBOR_TASK_FUNDING_PRODUCT,
    buyer_id: args.buyerId,
    account_id: args.buyerId,
    task_id: args.taskId,
    max_budget: args.maxBudget.toFixed(2),
    transfer_group: args.transferGroup,
    ...(args.clerkUserId ? { clerk_user_id: args.clerkUserId } : {}),
    ...(args.projectId ? { project_id: args.projectId } : {}),
    ...(args.taskType ? { task_type: args.taskType } : {}),
  };
}

export function taskTransferGroup(taskId: string): string {
  return `task:${taskId}`;
}
