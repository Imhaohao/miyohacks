import assert from "node:assert/strict";
import test from "node:test";
import { makeA2AForwardingSpecialist } from "../lib/specialists/a2a-forwarding";
import { hyperspellBrain } from "../lib/specialists/hyperspell-brain";
import type { SpecialistConfig } from "../lib/types";

const A2A_CONFIG: SpecialistConfig = {
  agent_id: "test-a2a",
  display_name: "test-a2a",
  sponsor: "Test",
  capabilities: ["connected-execution"],
  system_prompt: "You are a test A2A specialist.",
  cost_baseline: 0.4,
  starting_reputation: 0.5,
  one_liner: "Runs work through a connected A2A endpoint.",
  protocol: "a2a",
  verification_status: "unverified",
};

test("Hyperspell Brain declines generic implementation work even with an API key", async () => {
  const previous = process.env.HYPERSPELL_API_KEY;
  process.env.HYPERSPELL_API_KEY = "hs-0-test";
  try {
    const bid = await hyperspellBrain.bid(
      "Make the quarterly report generation look like an official report.",
      "implementation",
    );

    assert.equal("decline" in bid, true);
    assert.match(
      "reason" in bid ? bid.reason : "",
      /memory\/context specialist, not a repo implementation executor/,
    );
  } finally {
    if (previous === undefined) delete process.env.HYPERSPELL_API_KEY;
    else process.env.HYPERSPELL_API_KEY = previous;
  }
});

test("Hyperspell Brain bids as a live memory specialist when configured", async () => {
  const previous = process.env.HYPERSPELL_API_KEY;
  process.env.HYPERSPELL_API_KEY = "hs-0-test";
  try {
    const bid = await hyperspellBrain.bid(
      "Find what we know about customer positioning for this quarter report.",
      "context",
    );

    assert.equal("decline" in bid, false);
    assert.equal("tool_availability" in bid, true);
    assert.equal("tool_availability" in bid ? bid.tool_availability?.status : "", "available");
    assert.match(
      "execution_preview" in bid ? bid.execution_preview ?? "" : "",
      /Live Hyperspell run/,
    );
  } finally {
    if (previous === undefined) delete process.env.HYPERSPELL_API_KEY;
    else process.env.HYPERSPELL_API_KEY = previous;
  }
});

test("A2A specialists without endpoints decline instead of using a placeholder", async () => {
  const runner = makeA2AForwardingSpecialist(A2A_CONFIG);
  const bid = await runner.bid("Run this task through the remote agent.", "execution");

  assert.equal("decline" in bid, true);
  assert.match(
    "reason" in bid ? bid.reason : "",
    /No real A2A endpoint is configured/,
  );
});
