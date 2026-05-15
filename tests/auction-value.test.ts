import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeAuctionValue,
  qualityAdjustedVickreyPrice,
  roundMoney,
} from "../lib/auction-value";
import { isSelectableExecutorBid } from "../lib/auction-selection";
import { isExecutableAgent, roleForAgent } from "../lib/agent-roles";

const BASE = {
  taskType: "implementation",
  estimatedSeconds: 300,
  taskFitScore: 0.9,
  acceptanceRate: 0.9,
  reliabilityScore: 0.9,
  speedScore: 0.9,
  estimateAccuracy: 0.9,
  availabilityScore: 1,
};

test("cheap low-quality agent loses to higher-value agent", () => {
  const cheap = computeAuctionValue({
    ...BASE,
    taskFitScore: 0.5,
    historicalQuality: 0.1,
    acceptanceRate: 0.25,
    reliabilityScore: 0.3,
    speedScore: 0.5,
    estimateAccuracy: 0.4,
    bidPrice: 0.12,
  });
  const good = computeAuctionValue({
    ...BASE,
    historicalQuality: 0.9,
    bidPrice: 0.22,
  });

  assert.ok(good.valueScore > cheap.valueScore);
});

test("expensive high-quality agent wins only when quality justifies price", () => {
  const reasonable = computeAuctionValue({
    ...BASE,
    historicalQuality: 0.78,
    bidPrice: 0.32,
  });
  const overpriced = computeAuctionValue({
    ...BASE,
    historicalQuality: 0.95,
    bidPrice: 1.8,
  });

  assert.ok(reasonable.valueScore > overpriced.valueScore);
});

test("missing tools collapse availability-sensitive score", () => {
  const available = computeAuctionValue({
    ...BASE,
    historicalQuality: 0.8,
    bidPrice: 0.4,
    availabilityScore: 1,
  });
  const missing = computeAuctionValue({
    ...BASE,
    historicalQuality: 0.8,
    bidPrice: 0.4,
    availabilityScore: 0,
  });

  assert.ok(available.expectedQuality > missing.expectedQuality);
  assert.ok(available.valueScore > missing.valueScore);
});

test("bad estimate reduces score through latency and estimate accuracy", () => {
  const accurate = computeAuctionValue({
    ...BASE,
    historicalQuality: 0.8,
    bidPrice: 0.3,
    estimatedSeconds: 300,
    estimateAccuracy: 0.95,
  });
  const badEstimate = computeAuctionValue({
    ...BASE,
    historicalQuality: 0.8,
    bidPrice: 0.3,
    estimatedSeconds: 3600,
    estimateAccuracy: 0.25,
  });

  assert.ok(badEstimate.effectivePrice > accurate.effectivePrice);
  assert.ok(accurate.valueScore > badEstimate.valueScore);
});

test("quality-adjusted vickrey pricing uses runner-up benchmark", () => {
  const price = qualityAdjustedVickreyPrice({
    winnerExpectedQuality: 0.82,
    runnerUpValueScore: 1.2,
    winnerBidPrice: 0.4,
    maxBudget: 1,
  });

  assert.equal(price, 0.68);
});

test("single-bid fallback pays winner bid capped by budget", () => {
  assert.equal(
    qualityAdjustedVickreyPrice({
      winnerExpectedQuality: 0.9,
      winnerBidPrice: 1.2,
      maxBudget: 0.8,
    }),
    0.8,
  );
});

test("budget cap and money rounding", () => {
  assert.equal(roundMoney(0.825), 0.83);
  assert.equal(
    qualityAdjustedVickreyPrice({
      winnerExpectedQuality: 0.99,
      runnerUpValueScore: 0.2,
      winnerBidPrice: 0.4,
      maxBudget: 1,
    }),
    1,
  );
});

test("executive and context agents are not executable auction winners", () => {
  assert.equal(roleForAgent("hyperspell-brain"), "executive");
  assert.equal(roleForAgent("nia-context"), "context");
  assert.equal(roleForAgent("codex-writer"), "executor");
  assert.equal(isExecutableAgent("hyperspell-brain"), false);
  assert.equal(isExecutableAgent("nia-context"), false);
  assert.equal(isExecutableAgent("codex-writer"), true);
});

test("selectable executor bids must be real external connections", () => {
  assert.equal(
    isSelectableExecutorBid(
      {
        agent_id: "nia-context",
        agent_role: "context",
        bid_price: 0.3,
        tool_availability: {
          status: "available",
          execution_status: "native_mcp",
        },
      },
      1,
    ),
    false,
  );
  assert.equal(
    isSelectableExecutorBid(
      {
        agent_id: "pilot-cfo",
        agent_role: "executor",
        bid_price: 0.3,
        tool_availability: {
          status: "available",
          execution_status: "mock_unconnected",
        },
      },
      1,
    ),
    false,
  );
  assert.equal(
    isSelectableExecutorBid(
      {
        agent_id: "github-engineering",
        agent_role: "executor",
        bid_price: 0.3,
        tool_availability: {
          status: "available",
          execution_status: "native_mcp",
        },
      },
      1,
    ),
    true,
  );
});
