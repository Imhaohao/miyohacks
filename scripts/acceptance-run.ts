#!/usr/bin/env tsx
// Live-mode acceptance harness CLI. Loads .env.local (when run with
// `node --env-file=.env.local`) and exercises every fixture-backed sponsor
// agent. Prints a compact per-agent readiness table plus the JSON snapshot.
//
// Usage:
//   node --env-file=.env.local --import tsx scripts/acceptance-run.ts
//   node --env-file=.env.local --import tsx scripts/acceptance-run.ts --judge llm
//   node --env-file=.env.local --import tsx scripts/acceptance-run.ts --agents reacher-social,codex-writer
//   node --env-file=.env.local --import tsx scripts/acceptance-run.ts --write-snapshot
//     (requires NEXT_PUBLIC_CONVEX_URL + ADMIN_DASHBOARD_SECRET)

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { runHarness, type AgentReadinessRecord } from "../lib/acceptance-harness";
import type { HarnessRunOptions, HarnessSnapshot } from "../lib/acceptance-harness";

function parseArgs(argv: string[]): {
  judgeMode: "rubric" | "llm";
  agents?: string[];
  json: boolean;
  writeSnapshot: boolean;
} {
  let judgeMode: "rubric" | "llm" = "rubric";
  let agents: string[] | undefined;
  let json = false;
  let writeSnapshot = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--judge") {
      const next = argv[++i];
      if (next === "rubric" || next === "llm") judgeMode = next;
      else throw new Error(`--judge must be 'rubric' or 'llm' (got '${next}')`);
    } else if (arg === "--agents") {
      const next = argv[++i];
      if (!next) throw new Error("--agents requires a comma-separated list");
      agents = next.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--write-snapshot") {
      writeSnapshot = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: scripts/acceptance-run.ts [--judge rubric|llm] [--agents id1,id2] [--json] [--write-snapshot]",
      );
      process.exit(0);
    }
  }
  return { judgeMode, agents, json, writeSnapshot };
}

async function writeSnapshotToConvex(snapshot: HarnessSnapshot) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const secret = process.env.ADMIN_DASHBOARD_SECRET?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  if (!secret) throw new Error("ADMIN_DASHBOARD_SECRET is not set");
  const client = new ConvexHttpClient(url);
  const writeRef = makeFunctionReference<"mutation">("acceptance:writeSnapshot");
  const result = await client.mutation(writeRef, {
    admin_secret: secret,
    run_id: `${snapshot.generated_at}`,
    generated_at: snapshot.generated_at,
    judge_mode: snapshot.judge_mode,
    summary: snapshot.summary,
    agents: snapshot.agents.map((agent) => ({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      sponsor: agent.sponsor,
      readiness: agent.readiness,
      in_domain: agent.in_domain,
      out_of_domain: agent.out_of_domain,
      notes: agent.notes,
    })),
  });
  return result as { run_id: string; count: number };
}

function colorFor(readiness: string): string {
  switch (readiness) {
    case "ready":
      return "\x1b[32m"; // green
    case "blocked":
      return "\x1b[33m"; // yellow
    case "needs_fix":
      return "\x1b[31m"; // red
    case "untested":
      return "\x1b[90m"; // grey
    default:
      return "";
  }
}

const RESET = "\x1b[0m";

function summarize(record: AgentReadinessRecord) {
  const tag = `${colorFor(record.readiness)}${record.readiness.padEnd(10)}${RESET}`;
  const inSt = `in:${record.in_domain.state}`;
  const outSt = `out:${record.out_of_domain.state}`;
  const reason =
    record.in_domain.state !== "accepted" && record.in_domain.reason
      ? ` — ${record.in_domain.reason.slice(0, 120)}`
      : "";
  console.log(
    `  ${tag}  ${record.agent_id.padEnd(20)}  ${inSt.padEnd(28)}  ${outSt.padEnd(26)}${reason}`,
  );
}

async function main() {
  const { judgeMode, agents, json, writeSnapshot } = parseArgs(process.argv.slice(2));
  const opts: HarnessRunOptions = { judgeMode, agents };
  if (judgeMode === "llm" && !process.env.OPENAI_API_KEY) {
    console.error("--judge llm requires OPENAI_API_KEY to be set.");
    process.exit(1);
  }
  console.log(
    `\nRunning acceptance harness · judge=${judgeMode} · agents=${agents?.join(",") ?? "<all>"}\n`,
  );
  const started = Date.now();
  const snapshot = await runHarness(opts);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    for (const record of snapshot.agents) {
      summarize(record);
    }
    const { summary } = snapshot;
    console.log(
      `\nReady: ${summary.ready}/${summary.total} · Blocked: ${summary.blocked} · Needs fix: ${summary.needs_fix} · Untested: ${summary.untested} · ${elapsed}s\n`,
    );
  }

  if (writeSnapshot) {
    try {
      const result = await writeSnapshotToConvex(snapshot);
      console.log(`Snapshot written to Convex: run_id=${result.run_id} agents=${result.count}`);
    } catch (err) {
      console.error(
        `Failed to write snapshot to Convex: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 3;
    }
  }

  // Exit non-zero when anything needs a fix so this can be a release gate in CI.
  if (snapshot.summary.needs_fix > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
