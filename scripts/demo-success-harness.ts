#!/usr/bin/env tsx
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = (process.env.DEMO_BASE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const MCP_ENDPOINT = process.env.MCP_ENDPOINT ?? `${BASE_URL}/api/mcp`;
const API_KEY = process.env.ARBOR_API_KEY;
const TASK_TYPE = process.env.DEMO_TASK_TYPE ?? "general";
const MAX_BUDGET = Number(process.env.DEMO_MAX_BUDGET ?? "200");
const TIMEOUT_MS = Number(process.env.DEMO_TIMEOUT_MS ?? "180000");
const POLL_MS = Number(process.env.DEMO_POLL_MS ?? "2000");

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

interface SpecialistState {
  agent_id: string;
  reputation_score: number;
  total_tasks_completed?: number;
}

interface LifecycleEvent {
  event_type: string;
  payload: Record<string, unknown>;
  timestamp?: number;
}

interface TaskBundle {
  task: {
    _id: string;
    status: string;
    workflow_mode?: string;
    winner_agent_id?: string;
    price_paid?: number;
    result?: unknown;
  } | null;
  bids: Array<{
    agent_id: string;
    bid_price: number;
    score: number;
  }>;
  escrow?: {
    locked_amount?: number;
    status?: string;
  } | null;
  lifecycle?: LifecycleEvent[];
}

interface PostedTask {
  task_id: string;
  status: string;
  workflow_mode: "product_demo" | "protocol_core";
  bid_window_closes_at: number;
  web_view_url: string;
}

let nextId = 1;

function headers() {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) result.Authorization = `Bearer ${API_KEY}`;
  return result;
}

async function rpc<T>(
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const id = nextId++;
  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${await response.text()}`);
  }
  const envelope = (await response.json()) as JsonRpcEnvelope<T>;
  if (envelope.error) {
    throw new Error(
      `MCP RPC ${envelope.error.code}: ${envelope.error.message}`,
    );
  }
  return envelope.result as T;
}

async function callTool<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = await rpc<ToolCallResult>("tools/call", {
    name,
    arguments: args,
  });
  if (result.isError) {
    throw new Error(result.content[0]?.text ?? `tool ${name} failed`);
  }
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}

function fail(message: string): never {
  throw new Error(`[demo harness] ${message}`);
}

function reputationMap(specialists: SpecialistState[]) {
  return new Map(specialists.map((s) => [s.agent_id, s.reputation_score]));
}

function eventOf(bundle: TaskBundle, eventType: string): LifecycleEvent {
  const event = bundle.lifecycle?.find((entry) => entry.event_type === eventType);
  if (!event) fail(`missing lifecycle event ${eventType}`);
  return event;
}

function numberField(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} was not a number`);
  }
  return value;
}

function verifyAuctionMath(bundle: TaskBundle) {
  const task = bundle.task;
  if (!task) fail("task bundle did not include task");
  const resolved = eventOf(bundle, "auction_resolved");
  const payload = resolved.payload;
  const vickrey = payload.vickrey as Record<string, unknown> | undefined;
  const winner = payload.winner as Record<string, unknown> | undefined;
  if (!vickrey || !winner) fail("auction_resolved payload missing math");

  const pricePaid = numberField(vickrey.price_paid, "vickrey.price_paid");
  const taskPrice = numberField(task.price_paid, "task.price_paid");
  if (taskPrice !== pricePaid) {
    fail(`task price ${taskPrice} did not match clearing price ${pricePaid}`);
  }
  if (bundle.escrow?.locked_amount !== undefined && bundle.escrow.locked_amount !== pricePaid) {
    fail(
      `escrow amount ${bundle.escrow.locked_amount} did not match clearing price ${pricePaid}`,
    );
  }

  const rule = String(vickrey.rule ?? "unknown");
  const bids = (payload.bids as unknown[]) ?? [];
  if (bids.length === 0) fail("auction math had no visible bids");

  const winnerId = String(winner.agent_id ?? "");
  if (!winnerId) fail("auction winner missing agent_id");

  console.log(
    `  Vickrey math: winner=${winnerId}, winner_bid=${vickrey.winner_bid_price}, runner_up=${vickrey.runner_up_bid_price ?? "none"}, clearing=${pricePaid}, rule=${rule}`,
  );
  return { winnerId, pricePaid, rule };
}

async function awaitTerminal(taskId: string): Promise<TaskBundle> {
  const terminal = new Set(["complete", "disputed", "failed", "cancelled"]);
  const started = Date.now();
  let lastStatus = "";
  while (Date.now() - started < TIMEOUT_MS) {
    const bundle = await callTool<TaskBundle>("get_task", { task_id: taskId });
    const status = bundle.task?.status ?? "unknown";
    if (status !== lastStatus) {
      console.log(`  status: ${status}`);
      lastStatus = status;
    }
    if (status === "plan_review") {
      fail(
        `${taskId} reached plan_review; protocol_core should not require manual approval`,
      );
    }
    if (terminal.has(status)) {
      if (status !== "complete") {
        fail(`${taskId} ended with ${status}`);
      }
      return bundle;
    }
    await sleep(POLL_MS);
  }
  fail(`${taskId} did not reach a terminal state within ${TIMEOUT_MS}ms`);
}

async function postAndVerify(label: string, prompt: string) {
  console.log(`\n${label}`);
  const posted = await callTool<PostedTask>("post_task", {
    prompt,
    max_budget: MAX_BUDGET,
    task_type: TASK_TYPE,
    workflow_mode: "protocol_core",
  });
  if (posted.workflow_mode !== "protocol_core") {
    fail(`post_task returned workflow_mode=${posted.workflow_mode}`);
  }
  if (posted.status !== "bidding") {
    fail(`protocol_core post_task returned initial status=${posted.status}`);
  }
  console.log(`  task: ${posted.task_id}`);
  console.log(`  web:  ${posted.web_view_url}`);

  const bundle = await awaitTerminal(posted.task_id);
  const math = verifyAuctionMath(bundle);
  return { posted, bundle, ...math };
}

function assertReputationMoved(
  label: string,
  winnerId: string,
  before: Map<string, number>,
  after: Map<string, number>,
) {
  const start = before.get(winnerId);
  const finish = after.get(winnerId);
  if (start === undefined) fail(`${label}: ${winnerId} missing before rep`);
  if (finish === undefined) fail(`${label}: ${winnerId} missing after rep`);
  if (finish <= start) {
    fail(
      `${label}: ${winnerId} reputation did not increase (${start} -> ${finish})`,
    );
  }
  console.log(
    `  reputation: ${winnerId} ${start.toFixed(3)} -> ${finish.toFixed(3)}`,
  );
}

async function main() {
  console.log("Arbor demo success harness");
  console.log(`  MCP endpoint: ${MCP_ENDPOINT}`);
  console.log(`  task type:    ${TASK_TYPE}`);
  console.log(`  budget:       ${MAX_BUDGET} credits`);
  if (!API_KEY && process.env.ALLOW_LEGACY_AGENT_IDS !== "true") {
    console.log(
      "  auth:         no ARBOR_API_KEY set; server must allow legacy agent ids",
    );
  }

  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "arbor-demo-success-harness", version: "0.1.0" },
    capabilities: {},
  });

  const initialSpecialists = await callTool<SpecialistState[]>("list_specialists");
  const before = reputationMap(initialSpecialists);
  if (initialSpecialists.length < 2) {
    fail("list_specialists returned fewer than two specialists");
  }

  const first = await postAndVerify(
    "Task 1: visible Vickrey auction",
    "Produce a concise evaluation of how an agent auction protocol should decide who gets paid. Include summary, risks, and recommendation.",
  );
  const afterFirst = reputationMap(await callTool<SpecialistState[]>("list_specialists"));
  assertReputationMoved("task 1", first.winnerId, before, afterFirst);

  const second = await postAndVerify(
    "Task 2: reputation flywheel",
    "Produce a concise evaluation of how portable reputation should influence the next agent auction. Include summary, risks, and recommendation.",
  );
  const afterSecond = reputationMap(await callTool<SpecialistState[]>("list_specialists"));
  assertReputationMoved("task 2", second.winnerId, afterFirst, afterSecond);

  console.log("\nDemo success checks passed");
  console.log(`  task 1 web: ${first.posted.web_view_url}`);
  console.log(`  task 2 web: ${second.posted.web_view_url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
