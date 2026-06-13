#!/usr/bin/env node
/**
 * Key-skip way #3 — optimistic enforcement probe for keyed A2A agents.
 *
 * Many A2A servers DECLARE an auth scheme in their card but don't actually
 * enforce it (demo deployments, x402 pay-per-call gated separately, etc.).
 * For each keyed agent we send a real message/send WITHOUT any key:
 *   - if it returns a normal JSON-RPC result (message/task) -> NOT enforced
 *     -> set a2a_auth_mode="none" so Arbor calls it keyless from now on.
 *   - if it returns 401/403 or a JSON-RPC auth error -> enforced, needs a key.
 *
 * Writes keyed-enforcement-report.json and (with --apply) upserts auth_mode.
 *
 * Usage:
 *   node scripts/probe-keyed-enforcement.mjs          # probe + report only
 *   node scripts/probe-keyed-enforcement.mjs --apply  # flip non-enforcing -> none
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const dir = new URL("..", import.meta.url).pathname;
const repoRoot = new URL("../../../", import.meta.url).pathname;
const apply = process.argv.includes("--apply");
const TIMEOUT = 12_000;

function convexUrl() {
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
console.error(`probing ${keyed.length} keyed agents for actual enforcement...`);

function mkBody() {
  return {
    jsonrpc: "2.0",
    id: `enf-${Math.floor(performance.now())}`,
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [{ kind: "text", text: "Hello — capability check. What can you do?" }],
        messageId: `enf-msg-${Math.floor(performance.now())}`,
        kind: "message",
      },
    },
  };
}

async function probe(rec) {
  try {
    const res = await fetch(rec.a2a_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(mkBody()),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status === 401 || res.status === 403) {
      return { agent_id: rec.agent_id, enforced: true, evidence: `HTTP ${res.status}` };
    }
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { return { agent_id: rec.agent_id, enforced: "unknown", evidence: `non-JSON ${res.status}` }; }
    if (j.error) {
      const m = `${j.error.code} ${j.error.message || ""}`.toLowerCase();
      const authErr = /auth|unauthor|forbidden|api[ -]?key|token|credential|401|403/.test(m);
      return { agent_id: rec.agent_id, enforced: authErr, evidence: `jsonrpc error ${j.error.code}: ${(j.error.message || "").slice(0, 80)}` };
    }
    // got a real result without any key -> not enforced
    const result = j.result || {};
    const parts = result.parts || result.message?.parts || result.status?.message?.parts || result.artifacts?.[0]?.parts || [];
    const reply = (parts.find((p) => p.text)?.text || result.kind || "ok").replace(/\s+/g, " ").slice(0, 90);
    return { agent_id: rec.agent_id, enforced: false, evidence: `keyless result ok: "${reply}"` };
  } catch (e) {
    return { agent_id: rec.agent_id, enforced: "unknown", evidence: String(e.name || e).slice(0, 50) };
  }
}

const results = [];
const CONC = 8;
let i = 0;
async function worker() {
  while (i < keyed.length) {
    const rec = keyed[i++];
    const r = await probe(rec);
    results.push({ ...r, endpoint: rec.a2a_endpoint });
    console.error(`  ${r.enforced === false ? "OPEN " : r.enforced === true ? "KEYED" : "?    "} ${r.agent_id}  ${r.evidence}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

const open = results.filter((r) => r.enforced === false);
const stillKeyed = results.filter((r) => r.enforced === true);
const unknown = results.filter((r) => r.enforced === "unknown");

writeFileSync(dir + "keyed-enforcement-report.json", JSON.stringify({
  generated: new Date().toISOString(),
  total_keyed: keyed.length,
  not_enforced_can_skip_key: open.length,
  truly_enforced_needs_key: stillKeyed.length,
  unknown: unknown.length,
  results,
}, null, 2));

console.error(`\n${open.length} NOT enforced (key-skippable) | ${stillKeyed.length} truly keyed | ${unknown.length} unknown`);

if (apply && open.length) {
  const client = new ConvexHttpClient(convexUrl());
  const upsert = makeFunctionReference("discoveredSpecialists:upsert");
  const byId = new Map(input.records.map((r) => [r.agent_id, r]));
  let flipped = 0;
  for (const r of open) {
    const rec = byId.get(r.agent_id);
    if (!rec) continue;
    const { a2a_api_key_env, ...rest } = rec; // drop the env requirement
    try {
      await client.mutation(upsert, { ...rest, a2a_auth_mode: "none" });
      flipped++;
    } catch (e) {
      console.error(`  flip FAIL ${r.agent_id}: ${String(e).slice(0, 120)}`);
    }
  }
  console.error(`applied: flipped ${flipped} agents to auth_mode=none (now keyless)`);
}
