#!/usr/bin/env node
/**
 * Key-skip part 3a — Optimistic keyless probe for keyed A2A agents.
 *
 * Many agent cards declare an auth scheme the server never enforces. For each
 * keyed agent in arbor-import-records.json:
 *   1. POST message/send with NO auth header.
 *   2. JSON-RPC envelope back  -> server doesn't enforce -> set
 *      a2a_auth_mode="none" on the discovered_specialists row (upsert).
 *   3. 401/403                 -> genuinely enforcing -> leave for acquisition.
 *   4. timeout/HTML            -> unknown -> leave as-is.
 *
 * Resumable: safe to re-run; upserts are idempotent.
 * Usage: node scripts/probe-keyed-agents.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const dir = new URL("..", import.meta.url).pathname;
const repoRoot = new URL("../../../", import.meta.url).pathname;
const DRY = process.argv.includes("--dry-run");
const TIMEOUT = 12_000;

function loadConvexUrl() {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return process.env.NEXT_PUBLIC_CONVEX_URL;
  for (const p of [repoRoot + ".env.local", repoRoot + ".env"]) {
    if (existsSync(p)) {
      const m = readFileSync(p, "utf8").match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m);
      if (m) return m[1].trim();
    }
  }
  throw new Error("NEXT_PUBLIC_CONVEX_URL not found");
}

const input = JSON.parse(readFileSync(dir + "arbor-import-records.json", "utf8"));
const keyed = input.records.filter((r) => r.a2a_api_key_env);
console.error(`probing ${keyed.length} keyed agents without auth...`);

async function probeNoAuth(rec) {
  const body = {
    jsonrpc: "2.0",
    id: "keyskip-1",
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [{ kind: "text", text: "ping (capability probe; no action needed)" }],
        messageId: "keyskip-probe-1",
        kind: "message",
      },
    },
  };
  try {
    const res = await fetch(rec.a2a_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status === 401 || res.status === 403) return { verdict: "enforcing", status: res.status };
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (j.jsonrpc === "2.0" || "result" in j || "error" in j) {
        return { verdict: "not_enforcing", status: res.status, sample: JSON.stringify(j).slice(0, 200) };
      }
    } catch { /* not JSON */ }
    return { verdict: "unknown", status: res.status, sample: text.slice(0, 100) };
  } catch (e) {
    return { verdict: "unknown", error: String(e.name || e).slice(0, 60) };
  }
}

const results = await Promise.all(keyed.map(async (rec) => ({ rec, probe: await probeNoAuth(rec) })));

const notEnforcing = results.filter((r) => r.probe.verdict === "not_enforcing");
const enforcing = results.filter((r) => r.probe.verdict === "enforcing");
const unknown = results.filter((r) => r.probe.verdict === "unknown");

console.error(`\nnot enforcing (card lies, can skip key): ${notEnforcing.length}`);
for (const r of notEnforcing) console.error(`  SKIP-KEY ${r.rec.agent_id}`);
console.error(`enforcing (need real key): ${enforcing.length}`);
for (const r of enforcing) console.error(`  ENFORCING ${r.rec.agent_id} (${r.probe.status})`);
console.error(`unknown (timeout/dead): ${unknown.length}`);
for (const r of unknown) console.error(`  UNKNOWN ${r.rec.agent_id} (${r.probe.error || r.probe.status})`);

writeFileSync(dir + "keyed-agents-probe.json", JSON.stringify({
  probed_at: new Date().toISOString(),
  not_enforcing: notEnforcing.map((r) => r.rec.agent_id),
  enforcing: enforcing.map((r) => ({ agent_id: r.rec.agent_id, endpoint: r.rec.a2a_endpoint, homepage: r.rec.homepage_url, env: r.rec.a2a_api_key_env })),
  unknown: unknown.map((r) => r.rec.agent_id),
  details: results.map((r) => ({ agent_id: r.rec