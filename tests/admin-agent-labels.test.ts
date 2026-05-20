import assert from "node:assert/strict";
import test from "node:test";
import {
  executionLabelFor,
  paymentLabelFor,
} from "../lib/admin-agent-labels";

function agent(overrides: Record<string, unknown> = {}) {
  return {
    agent_id: "linear-issues",
    display_name: "Linear Issues",
    sponsor: "Linear",
    reputation_score: 0.6,
    total_tasks_completed: 0,
    total_disputes_lost: 0,
    available_earnings: 0,
    payouts_enabled: false,
    requirements_due: [],
    ...overrides,
  } as Parameters<typeof executionLabelFor>[0];
}

test("native MCP agent is labelled Verified and Connect needed when no Stripe account", () => {
  const a = agent({ execution_status: "native_mcp" });
  assert.equal(executionLabelFor(a).label, "Verified");
  const payment = paymentLabelFor(a);
  assert.equal(payment.label, "Connect needed");
  assert.equal(payment.connectButton, "start");
});

test("sandbox agent is labelled Configured and Not payable", () => {
  const a = agent({ execution_status: "arbor_sandbox_adapter" });
  assert.equal(executionLabelFor(a).label, "Configured");
  const payment = paymentLabelFor(a);
  assert.equal(payment.label, "Not payable");
  assert.equal(payment.connectButton, "none");
});

test("Connect-ready agent shows refresh button, not start", () => {
  const a = agent({
    execution_status: "native_mcp",
    has_connect_account: true,
    payouts_enabled: true,
  });
  const payment = paymentLabelFor(a);
  assert.equal(payment.label, "Connect ready");
  assert.equal(payment.connectButton, "refresh");
});

test("Restricted Connect account surfaces as Transfer failed", () => {
  const a = agent({
    execution_status: "native_mcp",
    has_connect_account: true,
    payouts_enabled: false,
    requirements_due: ["external_account"],
  });
  const payment = paymentLabelFor(a);
  assert.equal(payment.label, "Transfer failed");
  assert.equal(payment.connectButton, "refresh");
});

test("mock-only execution status surfaces as Unavailable", () => {
  const a = agent({ execution_status: "mock_unconnected" });
  assert.equal(executionLabelFor(a).label, "Unavailable");
});
