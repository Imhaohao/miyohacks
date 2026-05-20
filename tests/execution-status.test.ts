import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAgentExecution,
  effectiveExecutionStatus,
  isSandboxA2AEnabled,
  isSelectableExecutionStatus,
  EXECUTION_STATUS_LABELS,
} from "../lib/agent-execution-status";
import {
  bidExecutionStatus,
  isSelectableExecutorBid,
  explainUnselectableExecutorBid,
} from "../lib/auction-selection";

function withSandboxA2A<T>(flag: boolean, fn: () => T): T {
  const previous = process.env.ENABLE_SANDBOX_A2A;
  const previousPolicy = process.env.ARBOR_MOCK_POLICY;
  delete process.env.ARBOR_MOCK_POLICY;
  if (flag) {
    process.env.ENABLE_SANDBOX_A2A = "true";
  } else {
    delete process.env.ENABLE_SANDBOX_A2A;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.ENABLE_SANDBOX_A2A;
    else process.env.ENABLE_SANDBOX_A2A = previous;
    if (previousPolicy === undefined) delete process.env.ARBOR_MOCK_POLICY;
    else process.env.ARBOR_MOCK_POLICY = previousPolicy;
  }
}

test("execution status enum includes arbor_sandbox_adapter with a label", () => {
  assert.equal(EXECUTION_STATUS_LABELS.arbor_sandbox_adapter, "Sandbox adapter");
});

test("isSandboxA2AEnabled reads the env flag", () => {
  withSandboxA2A(false, () => {
    assert.equal(isSandboxA2AEnabled(), false);
  });
  withSandboxA2A(true, () => {
    assert.equal(isSandboxA2AEnabled(), true);
  });
});

test("ARBOR_MOCK_POLICY=demo_mock_llm is the canonical sandbox switch", () => {
  const previousPolicy = process.env.ARBOR_MOCK_POLICY;
  const previousSandbox = process.env.ENABLE_SANDBOX_A2A;
  process.env.ARBOR_MOCK_POLICY = "demo_mock_llm";
  delete process.env.ENABLE_SANDBOX_A2A;
  try {
    assert.equal(isSandboxA2AEnabled(), true);
  } finally {
    if (previousPolicy === undefined) delete process.env.ARBOR_MOCK_POLICY;
    else process.env.ARBOR_MOCK_POLICY = previousPolicy;
    if (previousSandbox === undefined) delete process.env.ENABLE_SANDBOX_A2A;
    else process.env.ENABLE_SANDBOX_A2A = previousSandbox;
  }
});

test("sandbox eligibility promotes inactive A2A contacts only when flag is on", () => {
  const inactiveA2A = {
    agent_id: "quickbooks-ledger",
    protocol: "a2a" as const,
    a2a_agent_card_url: "https://quickbooks.intuit.com/agent-card.json",
  };
  withSandboxA2A(false, () => {
    assert.equal(classifyAgentExecution(inactiveA2A), "mock_unconnected");
    assert.equal(effectiveExecutionStatus(inactiveA2A), "mock_unconnected");
  });
  withSandboxA2A(true, () => {
    assert.equal(effectiveExecutionStatus(inactiveA2A), "arbor_sandbox_adapter");
  });
});

test("native MCP agents are never promoted to sandbox", () => {
  const mcp = {
    agent_id: "linear-issues",
    protocol: "mcp" as const,
    mcp_endpoint: "https://mcp.linear.app/mcp",
  };
  withSandboxA2A(true, () => {
    assert.equal(effectiveExecutionStatus(mcp), "native_mcp");
  });
});

test("sandbox status is selectable only when sandbox A2A is enabled", () => {
  const bid = {
    agent_id: "quickbooks-ledger",
    agent_role: "executor" as const,
    bid_price: 0.45,
    tool_availability: {
      status: "available" as const,
      execution_status: "arbor_sandbox_adapter" as const,
    },
  };
  withSandboxA2A(false, () => {
    assert.equal(isSelectableExecutionStatus("arbor_sandbox_adapter"), false);
    assert.equal(isSelectableExecutorBid(bid, 1), false);
    assert.match(
      explainUnselectableExecutorBid(bid, 1) ?? "",
      /demo mock LLM policy is disabled/,
    );
  });
  withSandboxA2A(true, () => {
    assert.equal(isSelectableExecutionStatus("arbor_sandbox_adapter"), true);
    assert.equal(isSelectableExecutorBid(bid, 1), true);
    assert.equal(explainUnselectableExecutorBid(bid, 1), null);
  });
});

test("real adapters are always selectable, mock and needs_vendor never are", () => {
  assert.equal(isSelectableExecutionStatus("native_mcp"), true);
  assert.equal(isSelectableExecutionStatus("native_a2a"), true);
  assert.equal(isSelectableExecutionStatus("arbor_real_adapter"), true);
  assert.equal(isSelectableExecutionStatus("mock_unconnected"), false);
  assert.equal(isSelectableExecutionStatus("needs_vendor_a2a_endpoint"), false);
});

test("bidExecutionStatus falls back to classifier when tool_availability omits it", () => {
  const bid = {
    agent_id: "linear-issues",
    bid_price: 0.5,
    tool_availability: { status: "available" as const },
  };
  // classifier-only path (no execution_status on bid)
  assert.equal(bidExecutionStatus(bid), "mock_unconnected");
});
