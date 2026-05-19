#!/usr/bin/env tsx
import { runArborMcpStdioServer } from "../lib/mcp-stdio-server";
import type { McpToolSurface } from "../lib/mcp-tools";

function parseSurface(argv: string[]): McpToolSurface {
  const flagIndex = argv.findIndex(
    (arg) => arg === "--surface" || arg === "--mcp-surface",
  );
  const raw =
    flagIndex >= 0 ? argv[flagIndex + 1] : process.env.ARBOR_MCP_SURFACE;
  if (!raw || raw === "core") return "core";
  if (raw === "extensions") return "extensions";
  throw new Error("--surface must be 'core' or 'extensions'");
}

async function main() {
  const surface = parseSurface(process.argv.slice(2));
  await runArborMcpStdioServer(surface);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

