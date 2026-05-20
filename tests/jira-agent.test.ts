import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_CONTACT_CATALOG,
  contactToSpecialistConfig,
} from "../lib/agent-contacts";
import { classifyAgentExecution } from "../lib/agent-execution-status";

test("atlassian-suite routes through external Jira A2A agent", () => {
  const contact = AGENT_CONTACT_CATALOG.find(
    (item) => item.agent_id === "atlassian-suite",
  );
  assert.ok(contact, "atlassian-suite contact should exist");
  assert.equal(contact?.protocol, "a2a");
  assert.ok(contact?.endpoint_url?.includes("/message/send"));
  assert.ok(contact?.agent_card_url?.includes("/agent-card"));
  assert.equal(contact?.auth_type, "oauth");
});

test("atlassian-suite classifies as native_a2a execution", () => {
  const contact = AGENT_CONTACT_CATALOG.find(
    (item) => item.agent_id === "atlassian-suite",
  );
  assert.ok(contact, "atlassian-suite contact should exist");
  const config = contactToSpecialistConfig(contact!);
  assert.equal(classifyAgentExecution(config), "native_a2a");
});
