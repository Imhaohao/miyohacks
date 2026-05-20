import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AGENT_CONTACT_CATALOG } from "../lib/agent-contacts";
import {
  CANONICAL_V0_SPECIALISTS,
  DEMO_EXTENSION_SPECIALISTS,
  SPECIALISTS,
} from "../lib/specialists/registry";
import {
  CANONICAL_V0_PROTOCOL_AGENT_IDS,
  DEMO_EXTENSION_AGENT_IDS,
  CONTACT_CATALOG_DISCOVERED_FOR,
  classifyAgentRoster,
  rosterMetadataFor,
} from "../lib/specialists/roster";

test("canonical v0 protocol roster remains the original five specialists", () => {
  assert.deepEqual(CANONICAL_V0_PROTOCOL_AGENT_IDS, [
    "nia-context",
    "hyperspell-brain",
    "tensorlake-exec",
    "codex-writer",
    "devin-engineer",
  ]);
  assert.deepEqual(
    CANONICAL_V0_SPECIALISTS.map((specialist) => specialist.agent_id),
    CANONICAL_V0_PROTOCOL_AGENT_IDS,
  );
});

test("demo extensions are separate from the canonical v0 roster", () => {
  assert.deepEqual(DEMO_EXTENSION_AGENT_IDS, [
    "reacher-social",
    "vercel-v0",
    "insforge-backend",
    "aside-browser",
    "convex-realtime",
  ]);
  assert.deepEqual(
    DEMO_EXTENSION_SPECIALISTS.map((specialist) => specialist.agent_id),
    DEMO_EXTENSION_AGENT_IDS,
  );
  assert.equal(SPECIALISTS.length, 10);
});

test("roster classifier labels canonical, demo, contact, discovered, and post-v0 agents", () => {
  assert.equal(classifyAgentRoster({ agent_id: "codex-writer" }), "canonical_v0");
  assert.equal(classifyAgentRoster({ agent_id: "reacher-social" }), "demo_extension");
  assert.equal(
    classifyAgentRoster({
      agent_id: "quickbooks-ledger",
      discovered: true,
      discovered_for: CONTACT_CATALOG_DISCOVERED_FOR,
    }),
    "discovered_contact",
  );
  assert.equal(
    classifyAgentRoster({
      agent_id: "live-registry-agent",
      discovered: true,
      discovery_source: "registry",
    }),
    "discovered_contact",
  );
  assert.equal(
    classifyAgentRoster({
      agent_id: "stripe-payments",
      discovered: true,
      discovery_source: "catalog",
    }),
    "post_v0_integration",
  );
});

test("100-agent contact catalog carries roster metadata without demoting canonical ids", () => {
  const codex = AGENT_CONTACT_CATALOG.find((c) => c.agent_id === "codex-writer");
  const quickbooks = AGENT_CONTACT_CATALOG.find(
    (c) => c.agent_id === "quickbooks-ledger",
  );

  assert.equal(codex?.roster_class, "canonical_v0");
  assert.equal(codex?.canonical_v0, true);
  assert.equal(quickbooks?.roster_class, "discovered_contact");
  assert.equal(quickbooks?.canonical_v0, false);
});

test("public registry API and UI expose roster labels", () => {
  const specialistsApi = readFileSync("app/api/v1/specialists/route.ts", "utf8");
  const agentsPage = readFileSync("app/agents/page.tsx", "utf8");
  const mcpTools = readFileSync("lib/mcp-tools.ts", "utf8");
  const metadata = rosterMetadataFor({ agent_id: "nia-context" });

  assert.equal(metadata.roster_label, "Canonical v0");
  assert.match(specialistsApi, /roster_class_counts/);
  assert.match(agentsPage, /All roster classes/);
  assert.match(mcpTools, /roster_class/);
});
