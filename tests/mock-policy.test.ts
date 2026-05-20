import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  currentMockPolicy,
  mockPolicyForExecutionStatus,
  mockPolicyMetadata,
} from "../lib/mock-policy";
import {
  effectiveExecutionStatus,
  isSandboxA2AEnabled,
} from "../lib/agent-execution-status";
import { configuredConnectionAvailability } from "../lib/specialists/connection-runtime";
import type { SpecialistConfig } from "../lib/types";

function withMockPolicyEnv<T>(
  env: {
    ARBOR_MOCK_POLICY?: string;
    ENABLE_SANDBOX_A2A?: string;
  },
  fn: () => T,
): T {
  const previousPolicy = process.env.ARBOR_MOCK_POLICY;
  const previousSandbox = process.env.ENABLE_SANDBOX_A2A;
  if (env.ARBOR_MOCK_POLICY === undefined) delete process.env.ARBOR_MOCK_POLICY;
  else process.env.ARBOR_MOCK_POLICY = env.ARBOR_MOCK_POLICY;
  if (env.ENABLE_SANDBOX_A2A === undefined) delete process.env.ENABLE_SANDBOX_A2A;
  else process.env.ENABLE_SANDBOX_A2A = env.ENABLE_SANDBOX_A2A;
  try {
    return fn();
  } finally {
    if (previousPolicy === undefined) delete process.env.ARBOR_MOCK_POLICY;
    else process.env.ARBOR_MOCK_POLICY = previousPolicy;
    if (previousSandbox === undefined) delete process.env.ENABLE_SANDBOX_A2A;
    else process.env.ENABLE_SANDBOX_A2A = previousSandbox;
  }
}

const SANDBOXABLE_A2A: SpecialistConfig = {
  agent_id: "quickbooks-ledger",
  display_name: "QuickBooks Ledger",
  sponsor: "Intuit",
  capabilities: ["bookkeeping"],
  system_prompt: "You reconcile books.",
  cost_baseline: 45,
  starting_reputation: 0.55,
  one_liner: "Bookkeeping workflows.",
  protocol: "a2a",
  a2a_endpoint: "http://localhost:3000/api/a2a/agents/quickbooks-ledger",
  a2a_agent_card_url: "http://localhost:3000/api/a2a/agents/quickbooks-ledger",
  execution_status: "mock_unconnected",
  verification_status: "mock",
};

test("mock policy defaults to strict no-mock execution", () => {
  withMockPolicyEnv({}, () => {
    assert.equal(currentMockPolicy(), "strict_no_mock");
    assert.equal(isSandboxA2AEnabled(), false);
    assert.equal(
      effectiveExecutionStatus(SANDBOXABLE_A2A),
      "mock_unconnected",
    );
  });
});

test("demo_mock_llm policy promotes eligible A2A contacts to disclosed sandbox", () => {
  withMockPolicyEnv({ ARBOR_MOCK_POLICY: "demo_mock_llm" }, () => {
    assert.equal(currentMockPolicy(), "demo_mock_llm");
    assert.equal(isSandboxA2AEnabled(), true);
    assert.equal(
      effectiveExecutionStatus(SANDBOXABLE_A2A),
      "arbor_sandbox_adapter",
    );
    const availability = configuredConnectionAvailability(SANDBOXABLE_A2A);
    assert.equal(availability.status, "available");
    assert.equal(availability.sandbox, true);
    assert.equal(availability.mock_policy, "demo_mock_llm");
    assert.match(availability.mock_policy_description ?? "", /Demo-only/);
  });
});

test("explicit strict policy overrides the legacy sandbox env flag", () => {
  withMockPolicyEnv(
    { ARBOR_MOCK_POLICY: "strict_no_mock", ENABLE_SANDBOX_A2A: "true" },
    () => {
      assert.equal(currentMockPolicy(), "strict_no_mock");
      assert.equal(isSandboxA2AEnabled(), false);
    },
  );
});

test("strict unavailable bids disclose the no-placeholder policy", () => {
  withMockPolicyEnv({}, () => {
    const availability = configuredConnectionAvailability(SANDBOXABLE_A2A);
    assert.equal(availability.status, "missing");
    assert.equal(availability.mock_policy, "strict_no_mock");
    assert.match(availability.reason ?? "", /strict no-mock policy/i);
    assert.match(
      mockPolicyMetadata(mockPolicyForExecutionStatus("mock_unconnected"))
        .mock_policy_description,
      /cannot bid, execute, or earn/,
    );
  });
});

test("mock policy is visible in bids, registry, API schema, and README", () => {
  const files = [
    "convex/bids.ts",
    "convex/schema.ts",
    "components/task/AuctionResolution.tsx",
    "app/agents/page.tsx",
    "app/api/v1/specialists/route.ts",
    "app/api/openapi.json/route.ts",
    "README.md",
  ]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  assert.match(files, /mock_policy/);
  assert.match(files, /demo_mock_llm/);
  assert.match(files, /strict_no_mock/);
  assert.match(files, /ARBOR_MOCK_POLICY=demo_mock_llm/);
});
