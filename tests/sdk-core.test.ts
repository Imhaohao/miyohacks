import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAuctionClient,
  type PostTaskResult,
} from "../packages/sdk-core/src/index";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("sdk postTask defaults to product_demo planning status", async () => {
  const postedBodies: Array<Record<string, unknown>> = [];
  const client = createAuctionClient({
    baseUrl: "https://arbor.example",
    agentId: "agent:sdk-test",
    fetch: async (_url, init) => {
      postedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        task_id: "task_product",
        status: "planning",
        workflow_mode: "product_demo",
        bid_window_closes_at: 1_700_000_000_000,
        web_view_url: "https://arbor.example/task/task_product",
      });
    },
  });

  const result = await client.postTask({
    prompt: "Write a launch plan.",
    max_budget: 1,
  });

  assert.equal(result.status, "planning");
  assert.equal(result.workflow_mode, "product_demo");
  assert.equal(postedBodies[0]?.agent_id, "agent:sdk-test");
});

test("sdk postTask protocol_core returns bidding status", async () => {
  const postedBodies: Array<Record<string, unknown>> = [];
  const client = createAuctionClient({
    baseUrl: "https://arbor.example",
    fetch: async (_url, init) => {
      postedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        task_id: "task_protocol",
        status: "bidding",
        workflow_mode: "protocol_core",
        bid_window_closes_at: 1_700_000_000_000,
        web_view_url: "https://arbor.example/task/task_protocol",
      });
    },
  });

  const result = await client.postTask({
    prompt: "Run the original protocol lifecycle.",
    max_budget: 1,
    workflow_mode: "protocol_core",
  });

  assert.equal(result.status, "bidding");
  assert.equal(result.workflow_mode, "protocol_core");
  assert.equal(postedBodies[0]?.workflow_mode, "protocol_core");
});

async function postTaskTypeNarrowingExamples() {
  const client = createAuctionClient({
    fetch: async () =>
      jsonResponse({
        task_id: "task_typecheck",
        status: "planning",
        workflow_mode: "product_demo",
        bid_window_closes_at: 1,
        web_view_url: "https://arbor.example/task/task_typecheck",
      }),
  });

  const defaultResult = await client.postTask({
    prompt: "Default lifecycle.",
    max_budget: 1,
  });
  const defaultStatus: "planning" = defaultResult.status;
  const defaultMode: "product_demo" = defaultResult.workflow_mode;

  const protocolResult = await client.postTask({
    prompt: "Fast protocol lifecycle.",
    max_budget: 1,
    workflow_mode: "protocol_core",
  });
  const protocolStatus: "bidding" = protocolResult.status;
  const protocolMode: "protocol_core" = protocolResult.workflow_mode;

  const dynamicMode = (
    Math.random() > 0.5 ? "product_demo" : "protocol_core"
  ) satisfies PostTaskResult["workflow_mode"];
  const dynamicResult = await client.postTask({
    prompt: "Either lifecycle.",
    max_budget: 1,
    workflow_mode: dynamicMode,
  });
  const dynamicStatus: "planning" | "bidding" = dynamicResult.status;

  void [
    defaultStatus,
    defaultMode,
    protocolStatus,
    protocolMode,
    dynamicStatus,
  ];
}

void postTaskTypeNarrowingExamples;
