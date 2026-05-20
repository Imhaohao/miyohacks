declare module "@mastra/core/tools" {
  export function createTool(config: {
    id: string;
    description?: string;
    inputSchema?: unknown;
    execute: (args: { context: any }) => unknown | Promise<unknown>;
  }): unknown;
}
