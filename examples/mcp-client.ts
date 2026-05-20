/**
 * Example MCP client — proves the agent-to-agent flow.
 *
 * Run:
 *   npx tsx examples/mcp-client.ts "your task brief here" 200
 *   WORKFLOW_MODE=protocol_core npx tsx examples/mcp-client.ts "your task" 200
 *
 * What it does:
 *   1. POSTs `tools/call` with `post_task` to /api/mcp.
 *   2. Prints the web_view_url so a human can click and watch the auction live.
 *   3. Polls `get_task` every 2s and prints status transitions until terminal.
 *   4. Prints the final result.
 *
 * Uses raw fetch (no SDK) so the on-the-wire payload is visible to the
 * reader. Any MCP-compliant client will work the same way against this
 * endpoint.
 */

const ENDPOINT =
  process.env.MCP_ENDPOINT ?? "http://localhost:3000/api/mcp";

interface JsonRpcEnvelope<T = unknown> {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

let nextId = 1;

async function rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const id = nextId++;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const env = (await res.json()) as JsonRpcEnvelope<T>;
  if (env.error) {
    throw new Error(`RPC error ${env.error.code}: ${env.error.message}`);
  }
  return env.result as T;
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await rpc<ToolCallResult>("tools/call", {
    name,
    arguments: args,
  });
  if (result.isError) {
    throw new Error(`tool ${name} error: ${result.content[0]?.text ?? "unknown"}`);
  }
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}

async function main() {
  const prompt =
    process.argv[2] ??
    "Compare three ways to add Stripe Connect payouts to our agent marketplace, recommend the safest path, and produce an implementation plan with risks and acceptance criteria.";
  const max_budget = Number(process.argv[3] ?? "200");
  const workflow_mode =
    process.env.WORKFLOW_MODE === "protocol_core"
      ? "protocol_core"
      : "product_demo";

  console.log(`endpoint: ${ENDPOINT}`);
  console.log(`prompt:   ${prompt}`);
  console.log(
    `budget:   ${max_budget} credits ($${(max_budget / 100).toFixed(2)})\n`,
  );
  console.log(`workflow: ${workflow_mode}\n`);

  // 1. handshake (optional for stateless server, but conventional)
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "example-mcp-client", version: "0.1.0" },
    capabilities: {},
  });

  // 2. post the task
  const posted = await callTool<{
    task_id: string;
    status: "planning" | "bidding";
    workflow_mode: "product_demo" | "protocol_core";
    bid_window_closes_at: number;
    web_view_url: string;
  }>("post_task", {
    prompt,
    max_budget,
    task_type: process.env.TASK_TYPE ?? "general",
    workflow_mode,
  });

  console.log(`task posted: ${posted.task_id}`);
  console.log(`initial status: ${posted.status}`);
  console.log(`workflow mode: ${posted.workflow_mode}`);
  console.log(`watch live: ${posted.web_view_url}\n`);

  // 3. poll for completion
  const terminalStatuses = new Set(["complete", "disputed", "failed", "cancelled"]);
  let lastStatus: string = posted.status;
  let lastPricePaid: number | undefined;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const state = await callTool<{
      task: { status: string; price_paid?: number; result?: unknown } | null;
      bids: Array<{ agent_id: string; bid_price: number; score: number }>;
    }>("get_task", { task_id: posted.task_id });

    const status = state.task?.status ?? "unknown";
    if (status !== lastStatus) {
      console.log(`status: ${status}`);
      lastStatus = status;
    }
    const pricePaid = state.task?.price_paid;
    if (pricePaid !== undefined && pricePaid !== lastPricePaid) {
      console.log(
        `price paid (protocol clearing): ${pricePaid} credits ($${(pricePaid / 100).toFixed(2)})`,
      );
      lastPricePaid = pricePaid;
    }
    if (terminalStatuses.has(status)) {
      console.log("\n--- final state ---");
      console.log(JSON.stringify(state, null, 2));
      return;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
