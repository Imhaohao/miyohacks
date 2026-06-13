#!/usr/bin/env node
/**
 * Retry JSON-RPC pings against arbor-compatible rows whose first ping failed.
 * Tries endpoint path variants and both modern + legacy A2A payload shapes.
 * Updates a2a-arbor-callable.json in place.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../a2a-arbor-callable.json", import.meta.url).pathname;
const data = JSON.parse(readFileSync(FILE, "utf8"));
const TIMEOUT_MS = 10_000;

const targets = data.results.filter(r =>
  r.status === "card_live" && r.arbor_compatible && r.auth_kind === "none" &&
  !(r.rpc && r.rpc.responded) && r.endpoint
);
console.error(`rescue targets: ${targets.length}`);

function variants(endpoint, cardUrl) {
  const v = new Set();
  try {
    const u = new URL(endpoint);
    v.add(endpoint);
    v.add(endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint + "/");
    v.add(u.origin);
    v.add(u.origin + "/a2a");
    v.add(u.origin + "/api/a2a");
    v.add(u.origin + "/a2a/v1");
    v.add(u.origin + "/jsonrpc");
  } catch { /* skip */ }
  if (cardUrl && cardUrl.includes("/.well-known/")) {
    try { v.add(new URL(cardUrl).origin); } catch { /* */ }
  }
  return [...v];
}

const payloads = [
  (id) => ({ jsonrpc: "2.0", id, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: "ping (probe)" }], messageId: "probe-" + id } } }),
  (id) => ({ jsonrpc: "2.0", id, method: "message/send", params: { message: { role: "user", parts: [{ type: "text", text: "ping (probe)" }], messageId: "probe-" + id } } }),
  (id) => ({ jsonrpc: "2.0", id, method: "tasks/send", params: { id: "task-probe-" + id, message: { role: "user", parts: [{ type: "text", text: "ping (probe)" }] } } }),
];

async function tryOne(url, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": "arbor-a2a-probe/1.0" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* */ }
    if (json && (json.jsonrpc === "2.0" || "result" in json || "error" in json)) {
      // a JSON-RPC "method not found"/-32601 or parse error still proves a live JSON-RPC server
      return { responded: true, url, status: res.status, sample: JSON.stringify(json).slice(0, 250) };
    }
    if (res.status === 401 || res.status === 403) return { responded: true, url, status: res.status, sample: "auth-gated live server" };
    return null;
  } catch { return null; } finally { clearTimeout(t); }
}

let rescued = 0, n = 0;
const CONC = 12;
let idx = 0;
async function worker() {
  while (idx < targets.length) {
    const r = targets[idx++];
    n++;
    let hit = null;
    outer: for (const url of variants(r.endpoint, r.card_url)) {
      for (let p = 0; p < payloads.length; p++) {
        hit = await Promise.race([
          tryOne(url, payloads[p](`rescue-${n}-${p}`)),
          new Promise(res => setTimeout(() => res(null), TIMEOUT_MS + 2000)),
        ]);
        if (hit) break outer;
      }
    }
    if (hit) {
      r.rpc = { responded: true, method: "rescue", status: hit.status, endpoint_used: hit.url, sample: hit.sample };
      rescued++;
    } else {
      r.rpc = r.rpc || { responded: false };
      r.rpc.rescue_attempted = true;
    }
    if (n % 20 === 0) console.error(`  ${n}/${targets.length} (rescued ${rescued})`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

// recompute totals
const live = data.results.filter(r => r.status === "card_live");
const compat = live.filter(r => r.arbor_compatible);
const callable = compat.filter(r => r.auth_kind !== "none" || (r.rpc && r.rpc.responded));
data.totals = { probed_all_time: data.results.length, card_live: live.length, arbor_compatible: compat.length, callable: callable.length };
data.generated = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(data, null, 2));
console.error(`rescued ${rescued}/${targets.length}; totals now: ${JSON.stringify(data.totals)}`);
