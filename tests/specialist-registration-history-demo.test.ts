import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyAgentRoster } from "../lib/specialists/roster";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("public specialist registration records endpoint probe readiness", () => {
  const route = read("app/api/v1/specialists/register/route.ts");
  const schema = read("convex/schema.ts");
  const discovered = read("convex/discoveredSpecialists.ts");
  const mcpTools = read("lib/mcp-tools.ts");
  const openapi = read("app/api/openapi.json/route.ts");

  assert.match(route, /probeSpecialistConnection/);
  assert.match(route, /api\.discoveredSpecialists\.create/);
  assert.match(route, /last_probe_status: probe\.status/);
  assert.match(route, /registered_via: "\/agents"/);
  assert.match(route, /protocol must be either mcp or a2a/);
  assert.match(route, /agent_card_url is required for A2A verification/);

  assert.match(schema, /v\.literal\("registered"\)/);
  assert.match(schema, /a2a_agent_card_url/);
  assert.match(schema, /last_probe_reason/);
  assert.match(discovered, /last_probe_latency_ms/);
  assert.match(mcpTools, /a2a_endpoint: d\.a2a_endpoint/);
  assert.match(mcpTools, /is_verified: d\.last_probe_status === "available"/);
  assert.match(openapi, /register_specialist/);
  assert.match(openapi, /stores the readiness result/);
  assert.equal(
    classifyAgentRoster({
      agent_id: "acme-research",
      discovered: true,
      discovery_source: "registered",
    }),
    "discovered_contact",
  );
});

test("agents page exposes registration and judge-derived reputation history", () => {
  const page = read("app/agents/page.tsx");
  const form = read("components/agents/SpecialistRegistrationForm.tsx");
  const contacts = read("convex/agentContacts.ts");

  assert.match(page, /SpecialistRegistrationForm/);
  assert.match(form, /\/api\/v1\/specialists\/register/);
  assert.match(form, /Register and probe/);
  assert.match(form, /Auth env hint/);
  assert.match(form, /Starting reputation/);

  assert.match(contacts, /discovered_specialists/);
  assert.match(contacts, /protocolForDiscovered/);
  assert.match(contacts, /verificationStatusForDiscovered/);

  assert.match(page, /api\.reputation\.history/);
  assert.match(page, /ReputationChart/);
  assert.match(page, /event\.reasoning/);
  assert.match(page, /No judge-derived reputation events yet/);
});

test("demo success harness exercises MCP core and fails on manual intervention", () => {
  const script = read("scripts/demo-success-harness.ts");
  const pkg = read("package.json");

  assert.match(script, /MCP_ENDPOINT/);
  assert.match(script, /tools\/call/);
  assert.match(script, /list_specialists/);
  assert.match(script, /post_task/);
  assert.match(script, /workflow_mode: "protocol_core"/);
  assert.match(script, /get_task/);
  assert.match(script, /auction_resolved/);
  assert.match(script, /vickrey\.price_paid/);
  assert.match(script, /escrow amount/);
  assert.match(script, /plan_review/);
  assert.match(script, /assertReputationMoved/);
  assert.match(pkg, /"demo:harness": "tsx scripts\/demo-success-harness\.ts"/);
});
