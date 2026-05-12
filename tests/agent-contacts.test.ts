import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_CONTACT_CATALOG } from "../lib/agent-contacts";

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

test("Arbor-hosted A2A bridge is used for contacts without native MCP", () => {
  const bridged = AGENT_CONTACT_CATALOG.filter((contact) => contact.protocol === "a2a");
  assert.ok(bridged.length >= 90);

  for (const contact of bridged) {
    assert.match(contact.endpoint_url ?? "", /\/api\/a2a\/agents\//);
    assert.equal(contact.agent_card_url, contact.endpoint_url);
    assert.equal(contact.auth_type, "none");
    assert.equal(contact.health_status, "healthy");
    assert.equal(contact.verification_status, "verified");
  }
});
