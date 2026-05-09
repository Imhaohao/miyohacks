/**
 * Example MCP client — proves the agent-to-agent flow.
 *
 * Run:
 *   npx tsx examples/mcp-client.ts "your startup launch brief here" 2.00
 *
 * What it does:
 *   1. POSTs `tools/call` with `post_task` to /api/mcp.
 *   2. Prints the web_view_url so a human can click and watch the auction live.
 *   3. Polls `get_task` every 2s until status is complete / disputed / failed.
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
    "We are a seed-stage startup launching a clean-label electrolyte drink on TikTok Shop. Find high-fit creators, cite Reacher evidence, draft outreach, request samples, flag risk, and produce a first 7-day launch plan.";
  const max_budget = Number(process.argv[3] ?? "2.00");

  console.log(`endpoint: ${ENDPOINT}`);
  console.log(`prompt:   ${prompt}`);
  console.log(`budget:   $${max_budget.toFixed(2)}\n`);

  // 1. handshake (optional for stateless server, but conventional)
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "example-mcp-client", version: "0.1.0" },
    capabilities: {},
  });

  // 2. post the task
  const posted = await callTool<{
    task_id: string;
    status: string;
    bid_window_closes_at: number;
    web_view_url: string;
  }>("post_task", {
    prompt,
    max_budget,
    task_type: process.env.TASK_TYPE ?? "reacher-live-launch",
  });

  console.log(`task posted: ${posted.task_id}`);
  console.log(`watch live: ${posted.web_view_url}\n`);

  // 3. poll for completion
  const terminalStatuses = new Set(["complete", "disputed", "failed"]);
  let lastStatus = "";
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const state = await callTool<{
      task: { status: string; price_paid?: number; result?: unknown };
      bids: Array<{ agent_id: string; bid_price: number; score: number }>;
    }>("get_task", { task_id: posted.task_id });

    const status = state.task?.status ?? "unknown";
    if (status !== lastStatus) {
      console.log(`status: ${status}`);
      lastStatus = status;
      if (status === "awarded" && state.task.price_paid !== undefined) {
        console.log(`  price paid (Vickrey): $${state.task.price_paid.toFixed(2)}`);
      }
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
