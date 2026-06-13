import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000;
const TERMINAL = new Set(["complete", "disputed", "failed"]);

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

function convexUrl(): string {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return url;
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function pass(label: string, ok: boolean, detail?: string): boolean {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
  return ok;
}

async function main() {
  const client = new ConvexHttpClient(convexUrl());

  let candidates: Array<unknown>;
  try {
    candidates = await client.action(api.hiveRegistry.searchAgents, {
      query: "research and summarize",
      include_unevaluated: false,
    });
  } catch (err) {
    console.log(
      `SKIP: hive registry search failed (${err instanceof Error ? err.message : String(err)})`,
    );
    return;
  }
  if (candidates.length === 0) {
    console.log(
      "SKIP: no eval-passed agents registered (run npm run hive:backfill and ensure live endpoints + ANTHROPIC_API_KEY on Convex)",
    );
    return;
  }

  const posted = await client.mutation(api.tasks.post, {
    posted_by: "hive-e2e",
    prompt:
      "Identify two well-known open agent-interoperability protocols, then write a short paragraph contrasting them.",
    max_budget: 4,
    workflow_mode: "hive",
  });
  const task_id = posted.task_id as Id<"tasks">;
  console.log(`hive-e2e: posted ${task_id}`);

  const timeoutMs = Number(process.env.HIVE_E2E_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const deadline = Date.now() + (Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
  let task = await client.query(api.tasks.get, { task_id });
  while (task && !TERMINAL.has(task.status) && Date.now() < deadline) {
    await sleep(POLL_MS);
    task = await client.query(api.tasks.get, { task_id });
    console.log(`hive-e2e: status=${task?.status ?? "missing"}`);
  }

  const lifecycle = await client.query(api.lifecycle.forTask, { task_id });
  const dag = await client.query(api.hiveData.dagForRootTask, { task_id });
  const nodeCount = dag
    ? await client.query(api.hiveData.nodeCountForDag, { dag_id: dag._id })
    : 0;
  const scratchpad = dag
    ? await client.query(api.scratchpad.forDag, { dag_id: dag._id })
    : [];
  const escalations = await client.query(api.escalations.forTask, { task_id });

  const events = lifecycle.map((event) => event.event_type);
  const assertions = [
    pass("root task reached terminal status", Boolean(task && TERMINAL.has(task.status))),
    pass("root task did not fail", task?.status !== "failed", `status=${task?.status ?? "missing"}`),
    pass("DAG exists with at least one node", Boolean(dag && nodeCount >= 1), `nodes=${nodeCount}`),
    pass("lifecycle includes hive_plan_decided", events.includes("hive_plan_decided")),
    pass(
      "lifecycle includes hive_node_routed",
      events.filter((event) => event === "hive_node_routed").length >= 1,
    ),
    pass(
      "lifecycle includes hive_node_settled",
      events.filter((event) => event === "hive_node_settled").length >= 1,
    ),
    pass("lifecycle includes hive_evaluated", events.includes("hive_evaluated")),
    pass("scratchpad has entries", scratchpad.length >= 1, `entries=${scratchpad.length}`),
    pass(
      "root result.text is non-empty",
      typeof task?.result === "object" &&
        task.result !== null &&
        "text" in task.result &&
        typeof task.result.text === "string" &&
        task.result.text.trim().length > 0,
    ),
  ];

  if (escalations.length > 0) {
    console.log(`hive-e2e: escalations=${escalations.length}`);
  }
  const passed = assertions.filter(Boolean).length;
  console.log(
    `hive-e2e: ${passed}/${assertions.length} assertions passed (status=${
      task?.status ?? "missing"
    })`,
  );
  process.exit(passed === assertions.length ? 0 : 1);
}

main().catch((err) => {
  console.error("hive-e2e failed:", err);
  process.exit(1);
});
