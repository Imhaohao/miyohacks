import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { buildA2ASendRequest } from "../lib/a2a-client";
import {
  GET as getA2AAgent,
  POST as postA2AAgent,
} from "../app/api/a2a/agents/[agentId]/route";

const routeContext = (agentId: string) => ({
  params: Promise.resolve({ agentId }),
});

test("A2A client sends message/send by default and supports legacy tasks/send", () => {
  const current = buildA2ASendRequest({
    prompt: "Run the task.",
    metadata: { task_type: "implementation" },
    id: "test-current",
  });
  const legacy = buildA2ASendRequest({
    prompt: "Run the task.",
    method: "tasks/send",
    id: "test-legacy",
  });

  assert.equal(current.method, "message/send");
  assert.equal(current.params.message.parts[0].text, "Run the task.");
  assert.equal(current.params.metadata?.task_type, "implementation");
  assert.equal(legacy.method, "tasks/send");
});

test("A2A agent card reports codex-writer as an Arbor real adapter", async () => {
  const previousWorkspace = process.env.CODEX_WORKSPACE_DIR;
  process.env.CODEX_WORKSPACE_DIR = "/tmp/arbor-codex-test";
  try {
    const res = await getA2AAgent(
      new NextRequest("http://localhost:3000/api/a2a/agents/codex-writer"),
      routeContext("codex-writer"),
    );
    const card = await res.json();

    assert.equal(card.protocolVersion, "0.2.6");
    assert.equal(card.capabilities.executionStatus, "arbor_real_adapter");
    assert.equal(card.capabilities.backingSystem, "codex_runner");
  } finally {
    if (previousWorkspace === undefined) delete process.env.CODEX_WORKSPACE_DIR;
    else process.env.CODEX_WORKSPACE_DIR = previousWorkspace;
  }
});

test("endpoint-gated sponsor agents report missing vendor A2A endpoints", async () => {
  const res = await getA2AAgent(
    new NextRequest("http://localhost:3000/api/a2a/agents/tensorlake-exec"),
    routeContext("tensorlake-exec"),
  );
  const card = await res.json();

  assert.equal(card.capabilities.executionStatus, "needs_vendor_a2a_endpoint");
});

test("mock catalog A2A agents fail instead of returning persona output", async () => {
  const res = await postA2AAgent(
    new NextRequest("http://localhost:3000/api/a2a/agents/quickbooks-ledger", {
      method: "POST",
      body: JSON.stringify(
        buildA2ASendRequest({
          prompt: "Reconcile this ledger.",
          id: "mock-agent-test",
        }),
      ),
      headers: { "content-type": "application/json" },
    }),
    routeContext("quickbooks-ledger"),
  );
  const body = await res.json();

  assert.equal(body.result.status.state, "failed");
  assert.match(
    body.result.status.message.parts[0].text,
    /will not substitute a ChatGPT placeholder/,
  );
});
