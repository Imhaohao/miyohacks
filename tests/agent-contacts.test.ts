import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_CONTACT_CATALOG } from "../lib/agent-contacts";
import { executionStatusCounts } from "../lib/agent-execution-status";
import { SPECIALISTS } from "../lib/specialists/registry";

test("all housed specialists have an MCP or A2A connection", () => {
  assert.equal(AGENT_CONTACT_CATALOG.length, 100);

  const connected = AGENT_CONTACT_CATALOG.filter(
    (contact) =>
      (contact.protocol === "mcp" && Boolean(contact.endpoint_url)) ||
      (contact.protocol === "a2a" &&
        Boolean(contact.endpoint_url) &&
        Boolean(contact.agent_card_url)),
  );

  assert.equal(connected.length, 100);
  assert.equal(AGENT_CONTACT_CATALOG.filter((c) => c.protocol === "mcp").length, 10);
  assert.equal(AGENT_CONTACT_CATALOG.filter((c) => c.protocol === "a2a").length, 90);
});

test("catalog reports real, endpoint-gated, and mock execution status", () => {
  const counts = executionStatusCounts(AGENT_CONTACT_CATALOG);

  assert.deepEqual(counts, {
    native_mcp: 12,
    native_a2a: 0,
    arbor_real_adapter: 3,
    needs_vendor_a2a_endpoint: 4,
    mock_unconnected: 81,
  });

  assert.equal(
    AGENT_CONTACT_CATALOG.find((c) => c.agent_id === "codex-writer")
      ?.execution_status,
    "arbor_real_adapter",
  );
  assert.equal(
    AGENT_CONTACT_CATALOG.find((c) => c.agent_id === "quickbooks-ledger")
      ?.execution_status,
    "mock_unconnected",
  );
});

test("sponsor roster identifies all agents needing vendor A2A endpoints", () => {
  const needingVendorA2A = SPECIALISTS.filter(
    (specialist) =>
      executionStatusCounts([specialist]).needs_vendor_a2a_endpoint === 1,
  ).map((specialist) => specialist.agent_id);

  assert.deepEqual(needingVendorA2A.sort(), [
    "aside-browser",
    "convex-realtime",
    "devin-engineer",
    "insforge-backend",
    "tensorlake-exec",
  ]);
});

test("Arbor-hosted A2A bridges are labeled by execution truth", () => {
  const bridged = AGENT_CONTACT_CATALOG.filter((contact) => contact.protocol === "a2a");
  assert.ok(bridged.length >= 90);

  for (const contact of bridged) {
    assert.match(contact.endpoint_url ?? "", /\/api\/a2a\/agents\//);
    assert.equal(contact.agent_card_url, contact.endpoint_url);
    if (contact.execution_status === "mock_unconnected") {
      assert.equal(contact.health_status, "unknown");
      assert.equal(contact.verification_status, "mock");
    }
  }
});
