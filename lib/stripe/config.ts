import Stripe from "stripe";

let stripe: Stripe | null = null;

export function stripeCheckoutEnabled(): boolean {
  return process.env.ARBOR_PAYMENTS_MODE === "stripe_checkout";
}

export function requireStripeCheckoutEnabled() {
  if (!stripeCheckoutEnabled()) {
    throw new Error(
      "Stripe checkout is disabled. Set ARBOR_PAYMENTS_MODE=stripe_checkout to enable real payment side effects.",
    );
  }
}

export function getStripe(): Stripe {
  requireStripeCheckoutEnabled();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required");
  if (!stripe) stripe = new Stripe(secretKey);
  return stripe;
}

export function stripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is required");
  return secret;
}

export function stripeBridgeSecret(): string | undefined {
  return process.env.ARBOR_STRIPE_CONVEX_BRIDGE_SECRET;
}

export function stripeCurrency(): string {
  return (process.env.STRIPE_CURRENCY ?? "usd").toLowerCase();
}

export function stripeConnectCountry(): string {
  return (process.env.STRIPE_CONNECT_COUNTRY ?? "US").toUpperCase();
}

export function stripePlatformFeeBps(): number {
  const raw = Number(process.env.ARBOR_PLATFORM_FEE_BPS ?? "1000");
  if (!Number.isFinite(raw)) return 1000;
  return Math.max(0, Math.min(10_000, Math.round(raw)));
}

export function amountToMinorUnits(amount: number): number {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(cents) || cents < 50) {
    throw new Error("Stripe checkout amount must be at least 0.50 in the configured currency");
  }
  return cents;
}

export function platformFeeAmount(amountMinor: number): number {
  return Math.floor((amountMinor * stripePlatformFeeBps()) / 10_000);
}

export function stripeBusinessProfileUrl(): string | undefined {
  return process.env.STRIPE_CONNECT_BUSINESS_URL || process.env.NEXT_PUBLIC_APP_URL;
}

export function stripeProductDescription(): string {
  return (
    process.env.STRIPE_CONNECT_PRODUCT_DESCRIPTION ??
    "Arbor agent marketplace services"
  );
}
