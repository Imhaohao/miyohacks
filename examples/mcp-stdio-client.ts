#!/usr/bin/env tsx
/**
 * Example local MCP stdio client.
 *
 * Run:
 *   npx tsx examples/mcp-stdio-client.ts
 *   npx tsx examples/mcp-stdio-client.ts --extensions
 *
 * The client spawns scripts/mcp-stdio.ts over stdio, performs the MCP
 * initialize handshake, and prints tools/list. It does not require Convex
 * credentials unless you add --call-list-specialists.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function main() {
  const useExtensions = process.argv.includes("--extensions");
  const callListSpecialists = process.argv.includes("--call-list-specialists");
  const surface = useExtensions ? "extensions" : "core";
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "scripts/mcp-stdio.ts", "--surface", surface],
    cwd: process.cwd(),
    env: inheritedEnv(),
    stderr: "pipe",
  });

  transport.stderr?.on("data", (chunk) => {
    process.stderr.write(String(chunk));
  });

  const client = new Client({
    name: "arbor-stdio-example-client",
    version: "0.1.0",
  });

  try {
    await client.connect(transport);
    const toolsResult = await client.request(
      { method: "tools/list", params: {} },
      ListToolsResultSchema,
    );

    console.log(`surface: ${surface}`);
    console.log(`tools (${toolsResult.tools.length}):`);
    for (const tool of toolsResult.tools) {
      console.log(`- ${tool.name}: ${tool.description ?? ""}`);
    }

    if (callListSpecialists) {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "list_specialists",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );
      console.log("\nlist_specialists result:");
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

