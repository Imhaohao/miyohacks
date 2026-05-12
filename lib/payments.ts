export const PLATFORM_FEE_RATE = 0.1;

export const CREDIT_CURRENCY = "USD";
export const FREE_TRIAL_CREDITS = 5;

export const CREDIT_PACKS = [
  { credits: 10, amountUsd: 10, label: "Starter" },
  { credits: 25, amountUsd: 25, label: "Builder" },
  { credits: 100, amountUsd: 100, label: "Scale" },
  { credits: 250, amountUsd: 250, label: "Marketplace" },
] as const;

export type CreditPack = (typeof CREDIT_PACKS)[number];

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCredits(value: number): string {
  return `${roundMoney(value).toFixed(2)} credits`;
}

export function amountToCents(value: number): number {
  return Math.round(roundMoney(value) * 100);
}

export function centsToAmount(cents: number): number {
  return roundMoney(cents / 100);
}

export function creditPackForCredits(credits: number): CreditPack | null {
  return CREDIT_PACKS.find((pack) => pack.credits === credits) ?? null;
}

export function calculatePlatformFee(amount: number): number {
  return roundMoney(amount * PLATFORM_FEE_RATE);
}

export function calculateAgentNet(amount: number): number {
  return roundMoney(amount - calculatePlatformFee(amount));
}

export function calculateEscrowSettlement(amount: number): {
  gross: number;
  platformFee: number;
  agentNet: number;
} {
  const gross = roundMoney(amount);
  const platformFee = calculatePlatformFee(gross);
  return {
    gross,
    platformFee,
    agentNet: roundMoney(gross - platformFee),
  };
}

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
