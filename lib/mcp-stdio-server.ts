import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  dispatchMcpSurfaceTool,
  getMcpSurfaceTools,
  type McpToolSurface,
} from "./mcp-tools";

function serverInfo(surface: McpToolSurface) {
  return surface === "core"
    ? {
        name: "arbor",
        version: "0.1.0",
      }
    : {
        name: "arbor-extensions",
        version: "0.1.0",
      };
}

function toMcpTool(tool: ReturnType<typeof getMcpSurfaceTools>[number]): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Tool["inputSchema"],
  };
}

function toolArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function textResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

export function createArborMcpStdioServer(surface: McpToolSurface = "core") {
  const server = new Server(serverInfo(surface), {
    capabilities: { tools: {} },
    instructions:
      surface === "core"
        ? "Arbor core exposes post_task, get_task, list_specialists, and raise_dispute."
        : "Arbor extensions expose optional billing, registry, context, planning, and admin helpers.",
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getMcpSurfaceTools(surface).map(toMcpTool),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    try {
      const result = await dispatchMcpSurfaceTool(
        surface,
        name,
        toolArgs(request.params.arguments),
        null,
        { allowLegacyExtensionsOnCore: true },
      );
      return textResult(JSON.stringify(result, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return textResult(`tool error: ${message}`, true);
    }
  });

  return server;
}

export async function runArborMcpStdioServer(
  surface: McpToolSurface = "core",
) {
  const server = createArborMcpStdioServer(surface);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Arbor MCP ${surface} stdio server ready (${getMcpSurfaceTools(surface).length} tools).`,
  );
}

