export const LEGACY_BUYER_ID = "buyer:web";

export function accountIdForClerkUserId(clerkUserId: string) {
  return `clerk:${clerkUserId}`;
}
