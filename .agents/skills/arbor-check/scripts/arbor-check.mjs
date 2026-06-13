#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const argv = new Set(process.argv.slice(2));
const wantJson = argv.has("--json");

if (argv.has("--help") || argv.has("-h")) {
  console.log(`Usage: node .agents/skills/arbor-check/scripts/arbor-check.mjs [options]

Options:
  --skip-convex      Skip Convex CLI/account checks
  --skip-typecheck   Skip npm run typecheck
  --skip-tests       Skip npm test
  --skip-e2e         Skip npm run hive:e2e
  --json             Emit machine-readable JSON
  --help             Show this help

Environment overrides:
  ARBOR_CHECK_E2E_TIMEOUT_MS       Default 420000
  ARBOR_CHECK_COMMAND_TIMEOUT_MS   Default 180000`);
  process.exit(0);
}

function findRepoRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, "package.json")) && existsSync(resolve(dir, "convex"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(process.cwd());
    dir = parent;
  }
}

const repoRoot = findRepoRoot(process.cwd());
const commandTimeoutMs = numberEnv("ARBOR_CHECK_COMMAND_TIMEOUT_MS", 180000);
const e2eTimeoutMs = numberEnv("ARBOR_CHECK_E2E_TIMEOUT_MS", 420000);
const checks = [];
const issues = [];
const envFiles = [".env.local", ".env"];
const loadedEnv = {};

function numberEnv(name, fallback) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addCheck(name, status, detail = "") {
  checks.push({ name, status, detail });
}

function addIssue(priority, area, symptom, fix, evidence = "") {
  issues.push({ priority, area, symptom, fix, evidence });
}

function redact(text) {
  return String(text ?? "")
    .replace(/((?:API_KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|BEARER)[A-Z0-9_]*\s*[:=]\s*)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/(Authorization:\s*(?:Bearer|Basic)\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|hs-0-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED_KEY]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[REDACTED_LONG_TOKEN]");
}

function tail(text, maxLines = 28) {
  const lines = redact(text).trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

function run(command, args, options = {}) {
  const timeout = options.timeoutMs ?? commandTimeoutMs;
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const timedOut = result.error?.code === "ETIMEDOUT";
  return {
    ok: result.status === 0 && !timedOut,
    status: timedOut ? "timeout" : result.status,
    output: redact(output),
    tail: tail(output),
    error: result.error ? String(result.error.message ?? result.error) : "",
  };
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
  if (!match) return null;
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [match[1], value];
}

function loadEnvFiles() {
  for (const file of envFiles) {
    const path = resolve(repoRoot, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (loadedEnv[key] === undefined) loadedEnv[key] = value;
    }
  }
}

function envValue(key) {
  return process.env[key] ?? loadedEnv[key] ?? "";
}

function present(key) {
  return envValue(key).trim().length > 0;
}

function envCheck() {
  loadEnvFiles();
  const hasPackage = existsSync(resolve(repoRoot, "package.json"));
  const hasConvex = existsSync(resolve(repoRoot, "convex"));
  addCheck("repo root", hasPackage && hasConvex ? "pass" : "fail", repoRoot);
  if (!hasPackage || !hasConvex) {
    addIssue(
      "P0",
      "repo",
      "Could not confirm Arbor repo root.",
      "Run arbor-check from /Users/yanzihao/Documents/miyohacks or a descendant directory.",
      repoRoot,
    );
  }

  const hasEnvLocal = existsSync(resolve(repoRoot, ".env.local"));
  addCheck(".env.local", hasEnvLocal ? "pass" : "warn", hasEnvLocal ? "present" : "missing");
  if (!hasEnvLocal) {
    addIssue(
      "P1",
      "env",
      ".env.local is missing.",
      "Create .env.local from .env.example and fill only local/dev values.",
      ".env.local",
    );
  }

  const requiredLocal = ["NEXT_PUBLIC_CONVEX_URL"];
  for (const key of requiredLocal) {
    const ok = present(key);
    addCheck(`env ${key}`, ok ? "pass" : "fail", ok ? "set" : "missing");
    if (!ok) {
      addIssue(
        "P0",
        "env",
        `${key} is missing locally.`,
        `Set ${key} in .env.local. Run npx convex dev if the value is stale or unknown.`,
      );
    }
  }

  const modelKeys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "AZURE_FOUNDRY_API_KEY", "AZURE_INFERENCE_CREDENTIAL"];
  if (!modelKeys.some(present)) {
    addIssue(
      "P1",
      "env",
      "No local model provider key is set.",
      "Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or the configured Azure/Foundry credential locally and on Convex where model calls run.",
      modelKeys.join(", "),
    );
  }
  addCheck("local model key", modelKeys.some(present) ? "pass" : "warn", modelKeys.filter(present).join(", ") || "none");
}

async function convexChecks() {
  if (argv.has("--skip-convex")) {
    addCheck("convex checks", "skip", "--skip-convex");
    return;
  }

  const dev = run("npx", ["convex", "dev", "--once"], { timeoutMs: commandTimeoutMs });
  addCheck("npx convex dev --once", dev.ok ? "pass" : "fail", dev.ok ? "functions ready" : dev.tail);
  if (!dev.ok) {
    addIssue(
      "P0",
      "convex",
      "Convex functions did not validate or deploy.",
      "Fix the first Convex compile/auth/deployment error, then rerun npx convex dev --once.",
      dev.tail,
    );
  }

  const envList = run("npx", ["convex", "env", "list"], { timeoutMs: 90000 });
  addCheck("npx convex env list", envList.ok ? "pass" : "warn", envList.ok ? "account/deployment reachable" : envList.tail);
  if (!envList.ok) {
    addIssue(
      "P1",
      "convex",
      "Convex env list failed; account or deployment may be unavailable.",
      "Run npx convex login, confirm CONVEX_DEPLOYMENT/NEXT_PUBLIC_CONVEX_URL, then rerun the check.",
      envList.tail,
    );
  }

  await registrySnapshot();
}

async function registrySnapshot() {
  const url = envValue("NEXT_PUBLIC_CONVEX_URL").trim();
  if (!url) {
    addCheck("registered agent snapshot", "skip", "NEXT_PUBLIC_CONVEX_URL missing");
    return;
  }
  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const apiPath = pathToFileURL(resolve(repoRoot, "convex/_generated/api.js")).href;
    const { api } = await import(apiPath);
    const client = new ConvexHttpClient(url);
    const [agents, discovered] = await Promise.all([
      client.query(api.agents.list, {}),
      client.query(api.discoveredSpecialists.list, {}),
    ]);
    const passed = discovered.filter((row) => row.eval_status === "passed").length;
    const failed = discovered.filter((row) => row.eval_status === "failed").length;
    addCheck(
      "registered agent snapshot",
      "pass",
      `${agents.length} registered, ${discovered.length} discovered A2A, ${passed} eval-passed, ${failed} eval-failed`,
    );
    if (passed === 0 && discovered.length > 0) {
      addIssue(
        "P1",
        "agents",
        "No discovered A2A agents are eval-passed.",
        "Run hive registry/eval backfill and inspect A2A endpoint failures before relying on live auctions.",
      );
    }
  } catch (error) {
    addCheck("registered agent snapshot", "warn", redact(error?.message ?? String(error)));
    addIssue(
      "P2",
      "agents",
      "Could not query registered/discovered agent snapshot.",
      "Confirm NEXT_PUBLIC_CONVEX_URL points at the expected deployment and generated Convex API is current.",
      redact(error?.message ?? String(error)),
    );
  }
}

function extractUrls(text) {
  return Array.from(new Set(String(text).match(/https?:\/\/[^\s"',)]+/g) ?? []));
}

async function probeUrl(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "user-agent": "arbor-check/1.0" },
    });
    return { ok: response.status >= 200 && response.status < 500, status: response.status };
  } catch (error) {
    return { ok: false, status: "error", error: redact(error?.message ?? String(error)) };
  } finally {
    clearTimeout(timer);
  }
}

async function tunnelChecks() {
  const version = run("cloudflared", ["--version"], { timeoutMs: 10000 });
  addCheck("cloudflared binary", version.ok ? "pass" : "warn", version.ok ? version.output.trim().split(/\r?\n/)[0] : "not found");

  const ps = run("ps", ["-ax", "-o", "pid=,command="], { timeoutMs: 10000 });
  const cloudflaredLines = ps.output
    .split(/\r?\n/)
    .filter((line) => /\bcloudflared\b/.test(line) && !line.includes("arbor-check.mjs"));
  addCheck("cloudflared process", cloudflaredLines.length > 0 ? "pass" : "warn", `${cloudflaredLines.length} process(es)`);

  const envText = Object.entries(loadedEnv)
    .filter(([key]) => /A2A|TUNNEL|ENDPOINT|DIRECTORY|URL/.test(key))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const urls = Array.from(
    new Set([...extractUrls(envText), ...extractUrls(cloudflaredLines.join("\n"))].filter((url) => url.includes("trycloudflare.com"))),
  );

  if (urls.length === 0) {
    addCheck("trycloudflare tunnels", "warn", "no trycloudflare URLs found in env or running process list");
    addIssue(
      "P2",
      "tunnels",
      "No trycloudflare tunnel URL was detected.",
      "If live A2A workers depend on cloudflared, start the tunnel and set ARBOR_A2A_DIRECTORY or the relevant *_A2A_ENDPOINT.",
    );
    return;
  }

  let failed = 0;
  for (const url of urls) {
    const base = url.replace(/\/+$/, "");
    const direct = await probeUrl(base);
    const card = await probeUrl(`${base}/.well-known/agent-card.json`);
    const legacy = card.ok ? null : await probeUrl(`${base}/.well-known/agent.json`);
    const ok = direct.ok || card.ok || legacy?.ok;
    if (!ok) failed += 1;
    addCheck(
      `tunnel ${base}`,
      ok ? "pass" : "fail",
      `base=${direct.status}, card=${card.status}, legacy=${legacy?.status ?? "skipped"}`,
    );
  }

  if (failed > 0) {
    addIssue(
      "P1",
      "tunnels",
      `${failed} trycloudflare tunnel probe(s) failed.`,
      "Restart cloudflared, update stale tunnel URLs in .env.local/Convex env, and re-run A2A discovery/eval.",
    );
  }
}

function packageChecks() {
  if (argv.has("--skip-typecheck")) {
    addCheck("npm run typecheck", "skip", "--skip-typecheck");
  } else {
    const typecheck = run("npm", ["run", "typecheck"], { timeoutMs: commandTimeoutMs });
    addCheck("npm run typecheck", typecheck.ok ? "pass" : "fail", typecheck.ok ? "ok" : typecheck.tail);
    if (!typecheck.ok) {
      addIssue("P0", "typecheck", "TypeScript failed.", "Fix the first TypeScript error, then rerun arbor-check.", typecheck.tail);
    }
  }

  if (argv.has("--skip-tests")) {
    addCheck("npm test", "skip", "--skip-tests");
  } else {
    const tests = run("npm", ["test"], { timeoutMs: commandTimeoutMs });
    addCheck("npm test", tests.ok ? "pass" : "fail", tests.ok ? "ok" : tests.tail);
    if (!tests.ok) {
      addIssue("P0", "tests", "Unit test suite failed.", "Fix the first failing test or broken runtime assumption, then rerun arbor-check.", tests.tail);
    }
  }
}

function e2eCheck() {
  if (argv.has("--skip-e2e")) {
    addCheck("npm run hive:e2e", "skip", "--skip-e2e");
    return;
  }
  const e2e = run("npm", ["run", "hive:e2e"], { timeoutMs: e2eTimeoutMs });
  addCheck("npm run hive:e2e", e2e.ok ? "pass" : "fail", e2e.ok ? "ok" : e2e.tail);
  if (!e2e.ok) {
    const output = e2e.output;
    let fix = "Inspect the E2E task lifecycle, then fix the first missing stage before rerunning npm run hive:e2e.";
    if (/no valid bids|0 accepted|all .* declined|auction_failed/i.test(output)) {
      fix = "Treat this as routing/market quality first: add a deterministic Arbor-owned fallback lane, improve shortlist fit, and write root failure diagnostics for no-bid paths.";
    } else if (/ANTHROPIC_API_KEY|OPENAI_API_KEY|AZURE_.*API_KEY|not set/i.test(output)) {
      fix = "Set the missing model/provider key in the runtime that emitted the error, usually both .env.local and Convex env for actions.";
    } else if (/NEXT_PUBLIC_CONVEX_URL|Could not find function|convex dev/i.test(output)) {
      fix = "Refresh Convex code/deployment with npx convex dev --once and confirm NEXT_PUBLIC_CONVEX_URL points at that deployment.";
    }
    addIssue("P1", "e2e", "Live auction/hive E2E regression failed.", fix, e2e.tail);
  }
}

function priorityRank(priority) {
  return { P0: 0, P1: 1, P2: 2 }[priority] ?? 9;
}

function printReport() {
  const sortedIssues = [...issues].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  if (wantJson) {
    console.log(JSON.stringify({ repoRoot, checks, issues: sortedIssues }, null, 2));
    return;
  }

  console.log("# Arbor Check Report");
  console.log("");
  console.log(`Repo: ${repoRoot}`);
  console.log("");
  console.log("## Checks");
  for (const check of checks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }
  console.log("");
  console.log("## Prioritized Fix List");
  if (sortedIssues.length === 0) {
    console.log("- No blocking fixes found.");
  } else {
    for (const item of sortedIssues) {
      console.log(`- ${item.priority} ${item.area}: ${item.symptom}`);
      console.log(`  Fix: ${item.fix}`);
      if (item.evidence) {
        console.log(`  Evidence: ${String(item.evidence).split(/\r?\n/).slice(0, 6).join(" | ")}`);
      }
    }
  }
}

async function main() {
  envCheck();
  await convexChecks();
  await tunnelChecks();
  packageChecks();
  e2eCheck();
  printReport();

  const hasP0 = issues.some((item) => item.priority === "P0");
  const hasP1 = issues.some((item) => item.priority === "P1");
  process.exit(hasP0 || hasP1 ? 1 : 0);
}

main().catch((error) => {
  addIssue("P0", "arbor-check", "arbor-check crashed.", "Fix the diagnostic script error, then rerun.", redact(error?.stack ?? error?.message ?? String(error)));
  printReport();
  process.exit(1);
});
