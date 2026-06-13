import assert from "node:assert/strict";
import {
  computePayout,
  currentPeriod,
  periodBounds,
  periodOf,
} from "./settlement-core";

assert.equal(
  periodOf(Date.UTC(2026, 5, 13, 12, 0, 0)),
  "2026-06",
  "periodOf should use UTC YYYY-MM",
);

assert.equal(
  currentPeriod(Date.UTC(2026, 5, 30)),
  "2026-06",
  "currentPeriod delegates to periodOf",
);

assert.deepEqual(
  periodBounds("2026-12"),
  {
    startMs: Date.UTC(2026, 11, 1),
    endMs: Date.UTC(2027, 0, 1),
  },
  "periodBounds should roll December to January",
);

const rows = computePayout(
  [
    {
      task_id: "t1",
      owner_id: "owner-a",
      agent_id: "agent-a",
      status: "complete",
      price_paid: 4,
    },
    {
      task_id: "t2",
      owner_id: "owner-a",
      agent_id: "agent-a",
      status: "complete",
      price_paid: 6,
    },
    {
      task_id: "t3",
      owner_id: "owner-a",
      agent_id: "agent-a",
      status: "disputed",
      price_paid: 9,
    },
  ],
  1000,
);

assert.deepEqual(rows, [
  {
    owner_id: "owner-a",
    agent_id: "agent-a",
    tasks_won: 3,
    tasks_accepted: 2,
    tasks_lost: 1,
    gross_volume: 10,
    platform_fee: 1,
    estimated_payout: 9,
  },
]);

assert.throws(() => periodBounds("2026-13"), /month/);

console.log("settlement-core tests passed");
