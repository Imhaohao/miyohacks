import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeAuctionValue,
  reputationWeightedBidScore,
  roundMoney,
  strictVickreySecondPrice,
} from "../lib/auction-value";
import {
  bidExecutionStatus,
  explainUnselectableExecutorBid,
  isSelectableExecutorBid,
} from "../lib/auction-selection";
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

test("quality diagnostics still identify cheap low-quality bids", () => {
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

test("quality diagnostics penalize overpriced high-quality bids", () => {
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

test("protocol bid score is reputation divided by bid price", () => {
  assert.equal(
    reputationWeightedBidScore({
      reputationScore: 0.75,
      bidPrice: 0.5,
    }),
    1.5,
  );
  assert.ok(
    Math.abs(
      reputationWeightedBidScore({
        reputationScore: 0.3,
        bidPrice: 0.1,
      }) - 3,
    ) < 1e-9,
  );
});

test("strict ranking ignores quality diagnostics in favor of reputation per bid", () => {
  const cheapLowRep = reputationWeightedBidScore({
    reputationScore: 0.2,
    bidPrice: 0.2,
  });
  const expensiveHighRep = reputationWeightedBidScore({
    reputationScore: 0.9,
    bidPrice: 0.45,
  });

  assert.ok(expensiveHighRep > cheapLowRep);
});

test("strict clearing price is the next-ranked eligible executor bid price", () => {
  const price = strictVickreySecondPrice({
    winnerBidPrice: 0.4,
    runnerUpBidPrice: 0.75,
    maxBudget: 1,
  });

  assert.equal(price, 0.75);
});

test("single-bid fallback pays winner bid capped by budget", () => {
  assert.equal(
    strictVickreySecondPrice({
      winnerBidPrice: 1.2,
      maxBudget: 0.8,
    }),
    0.8,
  );
});

test("strict clearing price is capped by budget and rounded to cents", () => {
  assert.equal(roundMoney(0.825), 0.83);
  assert.equal(
    strictVickreySecondPrice({
      winnerBidPrice: 0.4,
      runnerUpBidPrice: 4.95,
      maxBudget: 1,
    }),
    1,
  );
  assert.equal(
    strictVickreySecondPrice({
      winnerBidPrice: 0.4,
      runnerUpBidPrice: 0.585,
      maxBudget: 2,
    }),
    0.59,
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
  const contextBid = {
    agent_id: "nia-context",
    agent_role: "context" as const,
    bid_price: 0.3,
    tool_availability: {
      status: "available" as const,
      execution_status: "native_mcp" as const,
    },
  };
  assert.equal(isSelectableExecutorBid(contextBid, 1), false);
  assert.equal(
    explainUnselectableExecutorBid(contextBid, 1),
    "agent is context/executive support, not an executor",
  );

  const mockBid = {
    agent_id: "pilot-cfo",
    agent_role: "executor" as const,
    bid_price: 0.3,
    tool_availability: {
      status: "available" as const,
      execution_status: "mock_unconnected" as const,
    },
  };
  assert.equal(isSelectableExecutorBid(mockBid, 1), false);
  assert.equal(
    explainUnselectableExecutorBid(mockBid, 1),
    "agent has no verified external execution connection",
  );

  const missingToolsBid = {
    agent_id: "github-engineering",
    agent_role: "executor" as const,
    bid_price: 0.3,
    tool_availability: {
      status: "missing" as const,
      execution_status: "native_mcp" as const,
    },
  };
  assert.equal(isSelectableExecutorBid(missingToolsBid, 1), false);
  assert.equal(
    explainUnselectableExecutorBid(missingToolsBid, 1),
    "tools are missing",
  );

  const overBudgetBid = {
    agent_id: "github-engineering",
    agent_role: "executor" as const,
    bid_price: 1.1,
    tool_availability: {
      status: "available" as const,
      execution_status: "native_mcp" as const,
    },
  };
  assert.equal(isSelectableExecutorBid(overBudgetBid, 1), false);
  assert.equal(
    explainUnselectableExecutorBid(overBudgetBid, 1),
    "bid exceeds budget",
  );

  const availableBid = {
    agent_id: "github-engineering",
    agent_role: "executor" as const,
    bid_price: 0.3,
    tool_availability: {
      status: "available" as const,
      execution_status: "native_mcp" as const,
    },
  };
  assert.equal(isSelectableExecutorBid(availableBid, 1), true);
  assert.equal(explainUnselectableExecutorBid(availableBid, 1), null);
  assert.equal(bidExecutionStatus(availableBid), "native_mcp");
});
