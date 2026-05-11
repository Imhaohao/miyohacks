import assert from "node:assert/strict";
import test from "node:test";
import {
  CREDIT_PACKS,
  amountToCents,
  calculateEscrowSettlement,
  centsToAmount,
  creditPackForCredits,
  roundMoney,
} from "../lib/payments";

test("credit packs are fixed purchase units", () => {
  assert.deepEqual(
    CREDIT_PACKS.map((pack) => pack.credits),
    [10, 25, 100, 250],
  );
  assert.equal(creditPackForCredits(25)?.amountUsd, 25);
  assert.equal(creditPackForCredits(11), null);
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
