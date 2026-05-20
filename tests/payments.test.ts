import assert from "node:assert/strict";
import test from "node:test";
import {
  CREDITS_PER_USD,
  CREDIT_PACKS,
  FREE_TRIAL_CREDITS,
  calculateEscrowSettlement,
  calculatePlatformFee,
  checkoutMetadata,
  creditPackForCredits,
  creditsToUsd,
  formatCredits,
  formatCreditsAsUsd,
  formatUsd,
  usdToCredits,
} from "../lib/payments";
import { generateApiKey, hashApiKey } from "../lib/api-keys";
import { paymentServerSecret } from "../lib/stripe";

test("1 credit equals 1 cent of USD", () => {
  assert.equal(CREDITS_PER_USD, 100);
  assert.equal(usdToCredits(1), 100);
  assert.equal(usdToCredits(2.35), 235);
  assert.equal(creditsToUsd(235), 2.35);
});

test("usdToCredits rounds half-up so cents never disappear", () => {
  // 0.005 USD would be half a cent — round up to 1 credit, never 0.
  assert.equal(usdToCredits(0.005), 1);
  assert.equal(usdToCredits(0.014), 1);
  assert.equal(usdToCredits(0.015), 2);
});

test("credit packs are fixed integer-credit purchase units", () => {
  assert.deepEqual(
    CREDIT_PACKS.map((pack) => pack.credits),
    [1000, 2500, 10000, 25000],
  );
  assert.equal(creditPackForCredits(2500)?.amountUsd, 25);
  assert.equal(creditPackForCredits(1100), null);
});

test("each credit pack charges its USD price 1:1 in credits", () => {
  for (const pack of CREDIT_PACKS) {
    assert.equal(
      pack.credits,
      usdToCredits(pack.amountUsd),
      `pack ${pack.label} should equal usdToCredits(${pack.amountUsd})`,
    );
  }
});

test("free trial starts every account with 500 credits ($5.00)", () => {
  assert.equal(FREE_TRIAL_CREDITS, 500);
  assert.equal(creditsToUsd(FREE_TRIAL_CREDITS), 5);
});

test("formatters render credits as integers and USD as two-decimal dollars", () => {
  assert.equal(formatCredits(500), "500 credits");
  assert.equal(formatCredits(1000), "1,000 credits");
  // Stored credits are always integer, but a stray fractional input
  // must still render cleanly (no ".00 credits").
  assert.equal(formatCredits(499.6), "500 credits");
  assert.equal(formatUsd(5), "$5.00");
  assert.equal(formatCreditsAsUsd(235), "$2.35");
});

test("platform fee is a 10% integer-credit cut, rounded half-up", () => {
  assert.equal(calculatePlatformFee(100), 10);
  assert.equal(calculatePlatformFee(235), 24); // 23.5 → 24
  assert.equal(calculatePlatformFee(7), 1); // 0.7 → 1
  assert.equal(calculatePlatformFee(0), 0);
});

test("escrow settlement splits gross into integer fee + integer agent net", () => {
  assert.deepEqual(calculateEscrowSettlement(235), {
    gross: 235,
    platformFee: 24,
    agentNet: 211,
  });
});

test("settlement is exact in integer math — fee + net always equals gross", () => {
  // The old decimal model could lose or invent half-cents at this step.
  // Integer credits make the invariant trivial; assert it across the
  // full range we expect to see in production.
  for (const credits of [1, 7, 10, 99, 100, 235, 1249, 9999, 25000]) {
    const settlement = calculateEscrowSettlement(credits);
    assert.equal(
      settlement.platformFee + settlement.agentNet,
      settlement.gross,
      `settlement should sum exactly for ${credits} credits`,
    );
  }
});

test("checkout metadata binds Stripe credits to authenticated accounts", () => {
  assert.deepEqual(
    checkoutMetadata({
      buyerId: "clerk:user_123",
      clerkUserId: "user_123",
      credits: 1000,
    }),
    {
      buyer_id: "clerk:user_123",
      account_id: "clerk:user_123",
      clerk_user_id: "user_123",
      credits: "1000",
      product: "arbor_credits",
    },
  );
});

test("agent API keys are bearer-safe and hash deterministically", () => {
  const token = generateApiKey();
  assert.match(token, /^arbor_[A-Za-z0-9_-]+$/);
  assert.equal(hashApiKey(token), hashApiKey(token));
  assert.notEqual(hashApiKey(token), token);
});

test("payment server secret fails closed when missing", () => {
  const previous = process.env.PAYMENT_SERVER_SECRET;
  delete process.env.PAYMENT_SERVER_SECRET;
  try {
    assert.throws(
      () => paymentServerSecret(),
      /PAYMENT_SERVER_SECRET is required/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.PAYMENT_SERVER_SECRET;
    } else {
      process.env.PAYMENT_SERVER_SECRET = previous;
    }
  }
});

test("payment server secret trims and returns configured value", () => {
  const previous = process.env.PAYMENT_SERVER_SECRET;
  process.env.PAYMENT_SERVER_SECRET = "  shared-secret  ";
  try {
    assert.equal(paymentServerSecret(), "shared-secret");
  } finally {
    if (previous === undefined) {
      delete process.env.PAYMENT_SERVER_SECRET;
    } else {
      process.env.PAYMENT_SERVER_SECRET = previous;
    }
  }
});
