import assert from "node:assert/strict";
import test from "node:test";
import {
  CREDIT_PACKS,
  FREE_TRIAL_CREDITS,
  amountToCents,
  calculateEscrowSettlement,
  centsToAmount,
  checkoutMetadata,
  creditPackForCredits,
  roundMoney,
} from "../lib/payments";
import { generateApiKey, hashApiKey } from "../lib/api-keys";
import { paymentServerSecret } from "../lib/stripe";

test("credit packs are fixed purchase units", () => {
  assert.deepEqual(
    CREDIT_PACKS.map((pack) => pack.credits),
    [10, 25, 100, 250],
  );
  assert.equal(creditPackForCredits(25)?.amountUsd, 25);
  assert.equal(creditPackForCredits(11), null);
});

test("free trial starts every account with five credits", () => {
  assert.equal(FREE_TRIAL_CREDITS, 5);
});

test("money conversion stays in two-decimal precision", () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(amountToCents(12.345), 1235);
  assert.equal(centsToAmount(1235), 12.35);
});

test("escrow settlement splits gross into platform fee and agent net", () => {
  assert.deepEqual(calculateEscrowSettlement(2.35), {
    gross: 2.35,
    platformFee: 0.24,
    agentNet: 2.11,
  });
});

test("settlement never creates or destroys credits through rounding", () => {
  for (const amount of [0.01, 0.1, 0.99, 1, 2.35, 12.49, 99.99]) {
    const settlement = calculateEscrowSettlement(amount);
    assert.equal(
      roundMoney(settlement.platformFee + settlement.agentNet),
      settlement.gross,
    );
  }
});

test("checkout metadata binds Stripe credits to authenticated accounts", () => {
  assert.deepEqual(
    checkoutMetadata({
      buyerId: "clerk:user_123",
      clerkUserId: "user_123",
      credits: 10,
    }),
    {
      buyer_id: "clerk:user_123",
      account_id: "clerk:user_123",
      clerk_user_id: "user_123",
      credits: "10",
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
