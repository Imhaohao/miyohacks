import assert from "node:assert/strict";
import {
  extractDevinSessionId,
  extractPrMetadata,
  finalizeProvenance,
  mcpToolOutcome,
  redactToolArguments,
} from "./tool-call-audit";

function testRedaction() {
  assert.deepEqual(
    redactToolArguments({
      prompt: "build tic tac toe",
      apiKey: "secret",
      nested: { authorization: "Bearer secret", safe: "ok" },
    }),
    {
      prompt: "build tic tac toe",
      apiKey: "[redacted]",
      nested: { authorization: "[redacted]", safe: "ok" },
    },
  );
}

function testMcpOutcome() {
  assert.equal(
    mcpToolOutcome({
      result: { isError: true },
      preview: "bad",
    }).ok,
    false,
  );
  assert.equal(
    mcpToolOutcome({
      result: {},
      preview: "ok",
    }).ok,
    true,
  );
}

function testDevinSessionExtraction() {
  assert.equal(
    extractDevinSessionId(
      JSON.stringify({ sessions: [{ session_id: "devin-session-123" }] }),
    ),
    "devin-session-123",
  );
  assert.equal(
    extractDevinSessionId("```json\n{\"sessionId\":\"s-456\"}\n```"),
    "s-456",
  );
}

function testPrExtraction() {
  assert.deepEqual(
    extractPrMetadata(
      "Opened https://github.com/acme/demo/pull/42 for review.",
    ),
    {
      pr_url: "https://github.com/acme/demo/pull/42",
      pr_number: 42,
    },
  );
}

function testFinalizeMcpProvenance() {
  assert.equal(
    finalizeProvenance(
      { tier: "mcp-forwarding", transport: "mcp", live_tools_called: true },
      [],
    ).live_tools_called,
    false,
  );
  const proven = finalizeProvenance(
    { tier: "mcp-forwarding", transport: "mcp", live_tools_called: false },
    ["call1"],
  );
  assert.equal(proven.live_tools_called, true);
  assert.equal(proven.proof_level, "tool_call");
}

testRedaction();
testMcpOutcome();
testDevinSessionExtraction();
testPrExtraction();
testFinalizeMcpProvenance();
console.log("tool-call-audit tests passed");
