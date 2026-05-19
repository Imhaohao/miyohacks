import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CORE_MCP_TOOLS,
  EXTENSION_MCP_TOOLS,
  PRODUCT_EXTENSION_TOOLS,
  TOOLS,
  extensionToolName,
  isCoreMcpToolName,
  isExtensionMcpToolName,
  resolveExtensionMcpToolName,
} from "../lib/mcp-tools";

test("MCP core surface is exactly the four protocol tools", () => {
  const coreNames = CORE_MCP_TOOLS.map((tool) => tool.name).sort();

  assert.deepEqual(coreNames, [
    "get_task",
    "list_specialists",
    "post_task",
    "raise_dispute",
  ]);
  assert.ok(coreNames.every(isCoreMcpToolName));
});

test("MCP extensions are explicit and namespaced", () => {
  assert.equal(TOOLS.length, CORE_MCP_TOOLS.length + PRODUCT_EXTENSION_TOOLS.length);
  assert.ok(PRODUCT_EXTENSION_TOOLS.length > 0);
  assert.ok(TOOLS.every((tool) => typeof tool.category === "string"));
  assert.ok(
    PRODUCT_EXTENSION_TOOLS.every(
      (tool) => tool.category !== "protocol_core",
    ),
  );
  assert.equal(EXTENSION_MCP_TOOLS.length, PRODUCT_EXTENSION_TOOLS.length);
  assert.ok(EXTENSION_MCP_TOOLS.every((tool) => tool.name.includes(".")));
  assert.ok(EXTENSION_MCP_TOOLS.some((tool) => tool.name === "billing.get_wallet"));
  assert.ok(
    EXTENSION_MCP_TOOLS.some(
      (tool) => tool.name === "planning.approve_execution_plan",
    ),
  );
  assert.ok(EXTENSION_MCP_TOOLS.every((tool) => isExtensionMcpToolName(tool.name)));
  assert.equal(resolveExtensionMcpToolName("billing.get_wallet"), "get_wallet");
  assert.equal(resolveExtensionMcpToolName("get_wallet"), "get_wallet");
  assert.equal(resolveExtensionMcpToolName("post_task"), null);
  assert.equal(extensionToolName(PRODUCT_EXTENSION_TOOLS[0]), EXTENSION_MCP_TOOLS[0].name);
});
