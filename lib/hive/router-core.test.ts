import assert from "node:assert/strict";
import {
  buildRoutingQuery,
  perNodeBudget,
  shouldFallbackOpen,
} from "./router-core";

// ─── perNodeBudget ─────────────────────────────────────────────────────────
// Even split rounded to cents.
assert.equal(perNodeBudget(10, 3), 3.33, "10 / 3 should round to 3.33");
assert.equal(perNodeBudget(100, 4), 25, "100 / 4 should be 25");
assert.equal(perNodeBudget(1, 3), 0.33, "1 / 3 should round to 0.33");
// Zero node count must not divide by zero (treated as 1).
assert.equal(perNodeBudget(50, 0), 50, "0 nodes should be treated as 1");

// ─── shouldFallbackOpen ──────────────────────────────────────────────────────
// Fewer than 2 candidates -> fallback open.
assert.equal(shouldFallbackOpen([]), true, "0 candidates -> fallback");
assert.equal(
  shouldFallbackOpen([{ similarity: 0.9 }]),
  true,
  "1 candidate -> fallback even if strong",
);
// >=2 candidates but best similarity below 0.15 -> fallback open.
assert.equal(
  shouldFallbackOpen([{ similarity: 0.14 }, { similarity: 0.1 }]),
  true,
  "best < 0.15 -> fallback",
);
// >=2 candidates with a strong-enough best match -> keep the shortlist.
assert.equal(
  shouldFallbackOpen([{ similarity: 0.15 }, { similarity: 0.05 }]),
  false,
  "best == 0.15 -> keep shortlist",
);
assert.equal(
  shouldFallbackOpen([{ similarity: 0.8 }, { similarity: 0.4 }]),
  false,
  "strong candidates -> keep shortlist",
);

// ─── buildRoutingQuery ────────────────────────────────────────────────────────
// Includes description, success criteria, and up to 3 hints.
{
  const query = buildRoutingQuery(
    { description: "Summarize the PR diff", success_criteria: "Concise bullets" },
    ["hint one", "hint two", "hint three", "hint four (dropped)"],
  );
  assert.match(query, /Summarize the PR diff/, "must include description");
  assert.match(query, /Success criteria: Concise bullets/, "must include criteria");
  assert.match(query, /hint one/, "must include first hint");
  assert.match(query, /hint three/, "must include third hint");
  assert.doesNotMatch(query, /hint four/, "fourth hint must be dropped (max 3)");
}

// No success criteria -> no criteria line.
{
  const query = buildRoutingQuery({ description: "Just a task" }, []);
  assert.equal(query, "Just a task", "no criteria/hints -> description only");
}

// Clamped to <= 1500 chars.
{
  const huge = "x".repeat(5000);
  const query = buildRoutingQuery(
    { description: huge, success_criteria: huge },
    [huge, huge, huge],
  );
  assert.ok(query.length <= 1500, `routing query must be <= 1500 chars, got ${query.length}`);
}

console.log("router-core tests passed");
