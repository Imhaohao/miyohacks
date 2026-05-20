import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  initialStatusForWorkflow,
  isProtocolCoreWorkflow,
  normalizeTaskWorkflowMode,
} from "../lib/task-workflow";

test("workflow mode defaults to the richer product/demo lifecycle", () => {
  assert.equal(normalizeTaskWorkflowMode(undefined), "product_demo");
  assert.equal(normalizeTaskWorkflowMode("not-a-mode"), "product_demo");
  assert.equal(initialStatusForWorkflow("product_demo"), "planning");
});

test("protocol_core starts directly in bidding", () => {
  assert.equal(normalizeTaskWorkflowMode("protocol_core"), "protocol_core");
  assert.equal(isProtocolCoreWorkflow("protocol_core"), true);
  assert.equal(initialStatusForWorkflow("protocol_core"), "bidding");
});

test("task creation keeps product workflow and protocol fast path separate", () => {
  const tasks = readFileSync("convex/tasks.ts", "utf8");
  assert.match(tasks, /workflow_mode:\s*workflowMode/);
  assert.match(tasks, /status:\s*initialStatusForWorkflow\(workflowMode\)/);
  assert.match(tasks, /if \(protocolCore\) \{/);
  assert.match(tasks, /internal\.auctions\.solicitBids/);
  assert.match(tasks, /internal\.auctions\.resolve/);
  assert.match(tasks, /internal\.planning\.decompose/);
});

test("protocol fast path skips approval and executes after resolution", () => {
  const auctions = readFileSync("convex/auctions.ts", "utf8");
  assert.match(auctions, /isProtocolCoreWorkflow\(task\.workflow_mode\)/);
  assert.match(auctions, /internal\.escrow\._lock/);
  assert.match(auctions, /internal\.auctions\.execute/);
  assert.match(auctions, /internal\.auctions\.prepareExecutionPlan/);
});

test("public post_task surfaces workflow_mode", () => {
  const mcpTools = readFileSync("lib/mcp-tools.ts", "utf8");
  const openapi = readFileSync("app/api/openapi.json/route.ts", "utf8");
  assert.match(mcpTools, /workflow_mode/);
  assert.match(mcpTools, /protocol_core/);
  assert.match(openapi, /workflow_mode/);
  assert.match(openapi, /post -> bidding -> resolve -> execute -> judge -> settle/);
});
