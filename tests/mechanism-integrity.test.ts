import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  areBidsVisible,
  eligibleExecutorBids,
  protocolClearingPrice,
  sortBidsByProtocolScore,
  visibleBidsUnderBudget,
  type ProtocolBidLike,
} from "../lib/auction-mechanism";
import { reputationWeightedBidScore } from "../lib/auction-value";

interface TestBid extends ProtocolBidLike {
  bid_id: string;
}

function bid(args: {
  bid_id: string;
  agent_id: string;
  bid_price: number;
  score: number;
  agent_role?: TestBid["agent_role"];
  status?: NonNullable<TestBid["tool_availability"]>["status"];
  execution_status?: NonNullable<TestBid["tool_availability"]>["execution_status"];
}): TestBid {
  return {
    bid_id: args.bid_id,
    agent_id: args.agent_id,
    agent_role: args.agent_role ?? "executor",
    bid_price: args.bid_price,
    score: args.score,
    tool_availability: {
      status: args.status ?? "available",
      execution_status: args.execution_status ?? "native_mcp",
    },
  };
}

function readConvexSources(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (path.includes("convex/_generated/")) continue;
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else if (path.endsWith(".ts")) {
        out.push({ path, text: readFileSync(path, "utf8") });
      }
    }
  };
  walk("convex");
  return out;
}

test("bids are hidden until bid_window_closes_at", () => {
  assert.equal(areBidsVisible(999, 1000), false);
  assert.equal(areBidsVisible(1000, 1000), true);
  assert.equal(areBidsVisible(1001, 1000), true);

  const bidsQuery = readFileSync("convex/bids.ts", "utf8");
  assert.match(bidsQuery, /areBidsVisible\(Date\.now\(\), task\.bid_window_closes_at\)/);
  assert.match(bidsQuery, /return \[\]/);
});

test("over-budget bids cannot enter the executable winner set", () => {
  const maxBudget = 1;
  const overBudget = bid({
    bid_id: "expensive",
    agent_id: "codex-writer",
    bid_price: 2,
    score: 99,
  });
  const affordable = bid({
    bid_id: "affordable",
    agent_id: "vercel-v0",
    bid_price: 0.8,
    score: 1,
  });

  assert.deepEqual(
    visibleBidsUnderBudget([overBudget, affordable], maxBudget).map((b) => b.bid_id),
    ["affordable"],
  );
  assert.deepEqual(
    eligibleExecutorBids([overBudget, affordable], maxBudget).map((b) => b.bid_id),
    ["affordable"],
  );
});

test("context and executive support agents cannot win execution", () => {
  const context = bid({
    bid_id: "context",
    agent_id: "nia-context",
    agent_role: "context",
    bid_price: 0.05,
    score: 100,
  });
  const executive = bid({
    bid_id: "executive",
    agent_id: "hyperspell-brain",
    agent_role: "executive",
    bid_price: 0.05,
    score: 99,
  });
  const executor = bid({
    bid_id: "executor",
    agent_id: "codex-writer",
    bid_price: 0.7,
    score: 1,
  });

  assert.deepEqual(
    eligibleExecutorBids([context, executive, executor], 1).map((b) => b.bid_id),
    ["executor"],
  );
});

test("resolver ranking matches reputation_score / bid_price", () => {
  const lowerPriceButLowerScore = bid({
    bid_id: "cheap",
    agent_id: "vercel-v0",
    bid_price: 0.2,
    score: reputationWeightedBidScore({
      reputationScore: 0.2,
      bidPrice: 0.2,
    }),
  });
  const higherPriceButBetterScore = bid({
    bid_id: "trusted",
    agent_id: "codex-writer",
    bid_price: 0.45,
    score: reputationWeightedBidScore({
      reputationScore: 0.9,
      bidPrice: 0.45,
    }),
  });

  assert.deepEqual(
    sortBidsByProtocolScore([lowerPriceButLowerScore, higherPriceButBetterScore])
      .map((b) => b.bid_id),
    ["trusted", "cheap"],
  );
});

test("escrow locks the documented protocol clearing price", () => {
  const ranked = eligibleExecutorBids(
    [
      bid({
        bid_id: "winner",
        agent_id: "codex-writer",
        bid_price: 0.4,
        score: 2.4,
      }),
      bid({
        bid_id: "runner",
        agent_id: "vercel-v0",
        bid_price: 0.75,
        score: 1.8,
      }),
      bid({
        bid_id: "third",
        agent_id: "github-engineering",
        bid_price: 0.95,
        score: 1.1,
      }),
    ],
    1,
  );
  const pricePaid = protocolClearingPrice({
    winner: ranked[0],
    runnerUp: ranked[1],
    maxBudget: 1,
  });

  assert.equal(ranked[0].bid_id, "winner");
  assert.equal(ranked[1].bid_id, "runner");
  assert.equal(pricePaid, 0.75);

  const approvalCode = readFileSync("convex/executionPlans.ts", "utf8");
  assert.match(approvalCode, /locked_amount:\s*task\.price_paid/);
  assert.match(approvalCode, /price_paid === undefined/);

  const selectionCode = readFileSync("convex/auctionSelection.ts", "utf8");
  assert.match(selectionCode, /locked_amount:\s*price_paid/);
});

test("reputation changes only in settlement after a judge verdict exists", () => {
  const sources = readConvexSources();
  const reputationDeltaCallers = sources
    .filter(({ text }) => text.includes("internal.agents._applyReputationDelta"))
    .map(({ path }) => path);
  const dimensionRecordCallers = sources
    .filter(({ text }) => text.includes("internal.reputationDimensions._record"))
    .map(({ path }) => path);
  const reputationEventWriters = sources
    .filter(({ text }) => text.includes('db.insert("reputation_events"'))
    .map(({ path }) => path);

  assert.deepEqual(reputationDeltaCallers, ["convex/auctions.ts"]);
  assert.deepEqual(dimensionRecordCallers, ["convex/auctions.ts"]);
  assert.deepEqual(reputationEventWriters, ["convex/agents.ts"]);

  const auctions = readFileSync("convex/auctions.ts", "utf8");
  const settleStart = auctions.indexOf("export const settle");
  const verdictGuard = auctions.indexOf("if (!task.judge_verdict)");
  const dimensionRecord = auctions.indexOf("internal.reputationDimensions._record");
  const reputationDelta = auctions.indexOf("internal.agents._applyReputationDelta");

  assert.ok(settleStart > 0);
  assert.ok(verdictGuard > settleStart);
  assert.ok(dimensionRecord > verdictGuard);
  assert.ok(reputationDelta > verdictGuard);
});
