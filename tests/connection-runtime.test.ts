import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredConnectionAvailability,
  getSpecialistConnection,
} from "../lib/specialists/connection-runtime";
import type { SpecialistConfig } from "../lib/types";

const BASE_CONFIG: SpecialistConfig = {
  agent_id: "test-specialist",
  display_name: "test-specialist",
  sponsor: "Test",
  capabilities: ["testing"],
  system_prompt: "You are a test specialist.",
  cost_baseline: 0.1,
  starting_reputation: 0.5,
  one_liner: "Tests connection behavior.",
};

test("MCP specialists are unavailable until required credentials are present", () => {
  const previous = process.env.TEST_MCP_API_KEY;
  delete process.env.TEST_MCP_API_KEY;
  try {
    const config: SpecialistConfig = {
      ...BASE_CONFIG,
      protocol: "mcp",
      mcp_endpoint: "https://example.test/mcp",
      mcp_api_key_env: "TEST_MCP_API_KEY",
    };

    const connection = getSpecialistConnection(config);
    const availability = configuredConnectionAvailability(config);

    assert.equal(connection.protocol, "mcp");
    assert.equal(connection.native, true);
    assert.equal(availability.status, "missing");
    assert.deepEqual(availability.missing, ["TEST_MCP_API_KEY"]);
  } finally {
    if (previous === undefined) delete process.env.TEST_MCP_API_KEY;
    else process.env.TEST_MCP_API_KEY = previous;
  }
});

test("native A2A specialists remain distinct from Arbor-hosted bridges", () => {
  const config: SpecialistConfig = {
    ...BASE_CONFIG,
    protocol: "a2a",
    a2a_endpoint: "https://agents.example.test/tasks",
    a2a_agent_card_url: "https://agents.example.test/.well-known/agent-card.json",
    verification_status: "configured",
  };

  const connection = getSpecialistConnection(config);
  const availability = configuredConnectionAvailability(config);

  assert.equal(connection.protocol, "a2a");
  assert.equal(connection.native, true);
  assert.equal(availability.status, "available");
  assert.match(availability.reason ?? "", /native A2A/);
});

test("Arbor-hosted A2A bridges are explicit execution connections", () => {
  const config: SpecialistConfig = {
    ...BASE_CONFIG,
    agent_id: "codex-writer",
    protocol: "a2a",
    a2a_endpoint: "http://localhost:3000/api/a2a/agents/codex-writer",
    a2a_agent_card_url: "http://localhost:3000/api/a2a/agents/codex-writer",
    verification_status: "verified",
  };

  const connection = getSpecialistConnection(config);
  const availability = configuredConnectionAvailability(config);

  assert.equal(connection.protocol, "arbor_a2a_bridge");
  assert.equal(connection.native, false);
  assert.equal(availability.status, "available");
  assert.match(availability.reason ?? "", /Arbor-hosted A2A bridge/);
});

test("mock Arbor-hosted A2A catalog entries are unavailable for bidding", () => {
  const config: SpecialistConfig = {
    ...BASE_CONFIG,
    agent_id: "quickbooks-ledger",
    protocol: "a2a",
    a2a_endpoint: "http://localhost:3000/api/a2a/agents/quickbooks-ledger",
    a2a_agent_card_url: "http://localhost:3000/api/a2a/agents/quickbooks-ledger",
    verification_status: "mock",
    execution_status: "mock_unconnected",
  };

  const connection = getSpecialistConnection(config);
  const availability = configuredConnectionAvailability(config);

  assert.equal(connection.protocol, "arbor_a2a_bridge");
  assert.equal(availability.status, "missing");
  assert.match(availability.reason ?? "", /no real execution endpoint/);
});
