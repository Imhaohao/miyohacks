#!/usr/bin/env node
/**
 * @agent-auction/cli — `arbor`
 *
 * Thin command-line surface over Arbor's `/api/v1/*` REST endpoints.
 *
 * Subcommands:
 *   arbor market list   [--task-type TYPE] [--ready-only] [--json]
 *   arbor market post   <prompt> --budget N [--task-type TYPE] [--wait] [--json]
 *   arbor task   get    <task_id> [--json]
 *   arbor task   dispute <task_id> <reason> [--json]
 *   arbor --help        | -h
 *   arbor market --help | arbor task --help
 *
 * Env:
 *   ARBOR_BASE_URL  default http://localhost:3000
 *   ARBOR_AGENT_ID  default agent:cli
 *   ARBOR_API_KEY   optional bearer token (Authorization: Bearer …)
 *
 * Exit codes:
 *   0 success · 1 runtime/network/HTTP error · 2 usage error
 *
 * Implementation note: the CLI inlines a tiny REST client rather than
 * importing @agent-auction/sdk-core, because the SDK ships TypeScript
 * source (`main: "src/index.ts"`) which Node cannot import directly from
 * a `.mjs` runtime. The shapes here mirror the SDK so a future PR that
 * ships an SDK JS build can swap one import for the other.
 */

// ─── REST client (mirrors @agent-auction/sdk-core) ────────────────────────

function makeClient({ baseUrl, agentId, apiKey, fetch: customFetch }) {
  const root = baseUrl.replace(/\/$/, "");
  const doFetch = customFetch ?? globalThis.fetch;

  async function request(method, path, body) {
    const headers = {};
    if (body) headers["content-type"] = "application/json";
    if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
    const res = await doFetch(`${root}${path}`, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.error?.message ?? "";
      } catch {
        detail = await res.text();
      }
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${detail}`);
    }
    return await res.json();
  }

  return {
    listSpecialists(taskType) {
      const qs = taskType ? `?task_type=${encodeURIComponent(taskType)}` : "";
      return request("GET", `/api/v1/specialists${qs}`).then(
        (r) => r.specialists,
      );
    },
    postTask(input) {
      return request("POST", "/api/v1/tasks", { ...input, agent_id: agentId });
    },
    getTask(taskId) {
      return request("GET", `/api/v1/tasks/${encodeURIComponent(taskId)}`);
    },
    raiseDispute(taskId, reason) {
      return request(
        "POST",
        `/api/v1/tasks/${encodeURIComponent(taskId)}/dispute`,
        { reason },
      );
    },
  };
}

const TERMINAL_STATUSES = new Set([
  "complete",
  "disputed",
  "failed",
]);

async function awaitTask(client, taskId, { pollMs = 2000, timeoutMs } = {}) {
  const deadline = timeoutMs !== undefined ? Date.now() + timeoutMs : Infinity;
  for (;;) {
    const state = await client.getTask(taskId);
    const status = state?.task?.status;
    if (status && TERMINAL_STATUSES.has(status)) return state;
    if (Date.now() > deadline) {
      throw new Error(`awaitTask timeout for ${taskId}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ─── Argument parsing (zero deps, predictable) ───────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const name = tok.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[name] = true;
      } else {
        flags[name] = next;
        i++;
      }
    } else if (tok === "-h") {
      flags.help = true;
    } else {
      positional.push(tok);
    }
  }
  return { positional, flags };
}

// ─── Output helpers ──────────────────────────────────────────────────────

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function pad(str, width) {
  const s = String(str);
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function renderSpecialistTable(rows) {
  if (rows.length === 0) {
    process.stdout.write("(no specialists)\n");
    return;
  }
  const head = ["agent_id", "ready", "sponsor", "reputation", "reason"];
  const widths = [
    Math.max(head[0].length, ...rows.map((r) => String(r.agent_id ?? "").length)),
    Math.max(head[1].length, 5),
    Math.max(head[2].length, ...rows.map((r) => String(r.sponsor ?? "").length)),
    Math.max(head[3].length, 10),
    Math.max(
      head[4].length,
      ...rows.map((r) => String(r.market_ready_reason ?? "—").length),
    ),
  ];
  const line = (cols) => cols.map((c, i) => pad(c, widths[i])).join("  ");
  process.stdout.write(line(head) + "\n");
  process.stdout.write(line(widths.map((w) => "-".repeat(w))) + "\n");
  for (const r of rows) {
    const reputation =
      typeof r.reputation_score === "number"
        ? r.reputation_score.toFixed(2)
        : "—";
    const ready = r.market_ready ? "yes" : "no";
    process.stdout.write(
      line([
        r.agent_id,
        ready,
        r.sponsor ?? "—",
        reputation,
        r.market_ready_reason ?? "—",
      ]) + "\n",
    );
  }
}

function renderTaskState(state) {
  const t = state?.task;
  if (!t) {
    process.stdout.write("(no task)\n");
    return;
  }
  const lines = [
    `task_id:        ${t._id}`,
    `status:         ${t.status}`,
    `prompt:         ${truncate(t.prompt ?? "", 120)}`,
    `max_budget:     ${t.max_budget}`,
  ];
  if (t.price_paid !== undefined) lines.push(`price_paid:     ${t.price_paid}`);
  if (Array.isArray(state.bids)) {
    lines.push(`bids:           ${state.bids.length}`);
  }
  if (t.judge_verdict) {
    lines.push(
      `verdict:        ${t.judge_verdict.verdict} (quality ${t.judge_verdict.quality_score})`,
    );
  }
  if (t.result && typeof t.result === "object" && "text" in t.result) {
    lines.push(``);
    lines.push(`result:`);
    lines.push(truncate(String(t.result.text), 800));
  }
  process.stdout.write(lines.join("\n") + "\n");
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

// ─── Help text ───────────────────────────────────────────────────────────

const TOP_HELP = `arbor — Agent Auction Protocol CLI

Usage:
  arbor <command> <subcommand> [args] [flags]

Commands:
  market list      List specialists with market_ready, reputation, sponsor.
  market post      Post a task and (optionally) wait for the verdict.
  task get         Fetch a task's current state.
  task dispute     Reopen a completed task for the judge.

Env:
  ARBOR_BASE_URL   default http://localhost:3000
  ARBOR_AGENT_ID   default agent:cli
  ARBOR_API_KEY    optional bearer token

See 'arbor <command> --help' for subcommand-specific help.
`;

const MARKET_HELP = `arbor market — discovery and task posting

Usage:
  arbor market list   [--task-type TYPE] [--ready-only] [--json]
  arbor market post   <prompt> --budget N [--task-type TYPE] [--wait] [--json]

Examples:
  arbor market list --ready-only
  arbor market post "Compare three payout providers." --budget 200 --wait
`;

const TASK_HELP = `arbor task — inspect and dispute tasks

Usage:
  arbor task get      <task_id> [--json]
  arbor task dispute  <task_id> <reason> [--json]

Examples:
  arbor task get tasks/abc123
  arbor task dispute tasks/abc123 "artifact does not match spec"
`;

// ─── Subcommand handlers ─────────────────────────────────────────────────

async function cmdMarketList(client, args) {
  if (args.flags.help) {
    process.stdout.write(MARKET_HELP);
    return 0;
  }
  const taskType =
    typeof args.flags["task-type"] === "string"
      ? args.flags["task-type"]
      : undefined;
  let specialists = await client.listSpecialists(taskType);
  if (args.flags["ready-only"]) {
    specialists = specialists.filter((s) => s.market_ready === true);
  }
  if (args.flags.json) {
    printJson(specialists);
  } else {
    renderSpecialistTable(specialists);
    process.stdout.write(
      `\n${specialists.length} specialist${specialists.length === 1 ? "" : "s"}` +
        (taskType ? ` for task_type=${taskType}` : "") +
        (args.flags["ready-only"] ? " (market_ready=true)" : "") +
        "\n",
    );
  }
  return 0;
}

async function cmdMarketPost(client, args) {
  if (args.flags.help) {
    process.stdout.write(MARKET_HELP);
    return 0;
  }
  const prompt = args.positional[0];
  if (!prompt) {
    process.stderr.write("error: <prompt> is required\n\n" + MARKET_HELP);
    return 2;
  }
  const budget = Number(args.flags.budget);
  if (!Number.isFinite(budget) || budget <= 0) {
    process.stderr.write(
      "error: --budget <number> is required and must be > 0\n\n" + MARKET_HELP,
    );
    return 2;
  }
  const taskType =
    typeof args.flags["task-type"] === "string"
      ? args.flags["task-type"]
      : undefined;

  const posted = await client.postTask({
    prompt,
    max_budget: budget,
    ...(taskType ? { task_type: taskType } : {}),
  });

  if (args.flags.json && !args.flags.wait) {
    printJson(posted);
    return 0;
  }
  if (!args.flags.json) {
    process.stdout.write(
      `posted: ${posted.task_id} (status=${posted.status})\n`,
    );
    if (posted.web_view_url) {
      process.stdout.write(`watch:  ${posted.web_view_url}\n`);
    }
  }
  if (!args.flags.wait) {
    return 0;
  }
  if (!args.flags.json) {
    process.stdout.write("waiting for terminal state…\n");
  }
  const final = await awaitTask(client, posted.task_id);
  if (args.flags.json) {
    printJson({ posted, final });
  } else {
    process.stdout.write("\n");
    renderTaskState(final);
  }
  return 0;
}

async function cmdTaskGet(client, args) {
  if (args.flags.help) {
    process.stdout.write(TASK_HELP);
    return 0;
  }
  const taskId = args.positional[0];
  if (!taskId) {
    process.stderr.write("error: <task_id> is required\n\n" + TASK_HELP);
    return 2;
  }
  const state = await client.getTask(taskId);
  if (args.flags.json) {
    printJson(state);
  } else {
    renderTaskState(state);
  }
  return 0;
}

async function cmdTaskDispute(client, args) {
  if (args.flags.help) {
    process.stdout.write(TASK_HELP);
    return 0;
  }
  const taskId = args.positional[0];
  const reason = args.positional.slice(1).join(" ");
  if (!taskId || !reason) {
    process.stderr.write(
      "error: <task_id> and <reason> are required\n\n" + TASK_HELP,
    );
    return 2;
  }
  const result = await client.raiseDispute(taskId, reason);
  if (args.flags.json) {
    printJson(result);
  } else {
    process.stdout.write(
      `dispute raised: ${taskId} — judge will re-evaluate.\n`,
    );
  }
  return 0;
}

// ─── Main ────────────────────────────────────────────────────────────────

export async function run(argv) {
  const top = argv[0];
  const sub = argv[1];

  if (!top || top === "--help" || top === "-h") {
    process.stdout.write(TOP_HELP);
    return top ? 0 : 2;
  }

  const client = makeClient({
    baseUrl: process.env.ARBOR_BASE_URL ?? "http://localhost:3000",
    agentId: process.env.ARBOR_AGENT_ID ?? "agent:cli",
    apiKey: process.env.ARBOR_API_KEY,
  });

  const rest = parseArgs(argv.slice(2));

  if (top === "market") {
    if (!sub || sub === "--help" || sub === "-h") {
      process.stdout.write(MARKET_HELP);
      return sub ? 0 : 2;
    }
    if (sub === "list") return await cmdMarketList(client, rest);
    if (sub === "post") return await cmdMarketPost(client, rest);
    process.stderr.write(
      `error: unknown subcommand 'market ${sub}'\n\n` + MARKET_HELP,
    );
    return 2;
  }

  if (top === "task") {
    if (!sub || sub === "--help" || sub === "-h") {
      process.stdout.write(TASK_HELP);
      return sub ? 0 : 2;
    }
    if (sub === "get") return await cmdTaskGet(client, rest);
    if (sub === "dispute") return await cmdTaskDispute(client, rest);
    process.stderr.write(
      `error: unknown subcommand 'task ${sub}'\n\n` + TASK_HELP,
    );
    return 2;
  }

  process.stderr.write(`error: unknown command '${top}'\n\n` + TOP_HELP);
  return 2;
}

// Re-export for inspection / future tests.
export const __testables = {
  parseArgs,
  makeClient,
  awaitTask,
  cmdMarketList,
  cmdMarketPost,
  cmdTaskGet,
  cmdTaskDispute,
  TOP_HELP,
  MARKET_HELP,
  TASK_HELP,
};

// Only run when invoked as a script. When imported (e.g. by tests) we
// expose `run` and helpers without side effects.
const invokedDirectly = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    const url = new URL(`file://${argv1}`).href;
    return import.meta.url === url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code ?? 0))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`arbor: ${msg}\n`);
      process.exit(1);
    });
}
