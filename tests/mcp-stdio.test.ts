import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function listStdioTools(surface: "core" | "extensions") {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "scripts/mcp-stdio.ts", "--surface", surface],
    cwd: process.cwd(),
    env: inheritedEnv(),
    stderr: "pipe",
  });
  const client = new Client({
    name: "arbor-stdio-test-client",
    version: "0.1.0",
  });

  try {
    await client.connect(transport);
    const result = await client.request(
      { method: "tools/list", params: {} },
      ListToolsResultSchema,
    );
    return result.tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
  }
}

test("stdio MCP core transport exposes the four protocol tools", async () => {
  const names = await listStdioTools("core");

  assert.deepEqual(names, [
    "get_task",
    "list_specialists",
    "post_task",
    "raise_dispute",
  ]);
});

test("stdio MCP extension transport exposes namespaced extension tools", async () => {
  const names = await listStdioTools("extensions");

  assert.ok(names.length > 4);
  assert.ok(names.every((name) => name.includes(".")));
  assert.ok(names.includes("billing.get_wallet"));
  assert.ok(names.includes("planning.approve_execution_plan"));
  assert.ok(!names.includes("post_task"));
});

