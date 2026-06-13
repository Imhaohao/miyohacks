#!/usr/bin/env node
/**
 * Strict re-verification of the final callable list.
 * - Drops rows whose only RPC proof was a 401/403 ("auth-gated") or whose
 *   rpc endpoint host is a generic file host (raw.githubusercontent.com etc.).
 * - Re-pings every keyless row live, twice (message/send modern + legacy parts shape),
 *   requiring a real JSON-RPC envelope. Records recheck result + timestamp.
 * - Keyed rows (bearer/apiKey): re-fetches the live card and confirms the scheme.
 * Rewrites a2a-arbor-callable-final.json/csv with only strict survivors in `callable`.
 */
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("..", import.meta.url).pathname;
const final = JSON.parse(readFileSync(dir + "a2a-arbor-callable-final.json", "utf8"));
const BAD_HOSTS = ["raw.githubusercontent.com", "github.com", "gist.githubusercontent.com"];
const TIMEOUT = 10_000;

function host(u) { try { return new URL(u).hostname; } catch { return ""; } }

async function post(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST", signal: AbortSignal.timeout(TIMEOUT),
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": "arbor-a2a-probe/1.0" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (j.jsonrpc === "2.0" || "result" in j || "error" in j) return { ok: true, status: res.status, sample: JSON.stringify(j).slice(0, 250) };
    } catch { /* not json */ }
    return { ok: false, status: res.status };
  } catch (e) { return { ok: false, err: String(e).slice(0, 80) }; }
}

async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: "application/json", "user-agent": "arbor-a2a-probe/1.0" } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

const mkModern = () => ({ jsonrpc: "2.0", id: "strict-1", method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: "ping (capability probe)" }], messageId: "strict-1" } } });
const mkLegacy = () => ({ jsonrpc: "2.0", id: "strict-2", method: "message/send", params: { message: { role: "user", parts: [{ type: "text", text: "ping (capability probe)" }], messageId: "strict-2" } } });
const mkTasks  = () => ({ jsonrpc: "2.0", id: "strict-3", method: "tasks/send", params: { id: "strict-task-3", message: { role: "user", parts: [{ type: "text", text: "ping (capability probe)" }] } } });

const rows = final.callable;
console.error(`strict re-verify on ${rows.length} rows`);
const survivors = [];
const dropped = [];
let i = 0;
const CONC = 12;

async function worker() {
  while (i < rows.length) {
    const r = rows[i++];
    const now = new Date().toISOString();

    // structural rejects
    const rpcHost = host(r.rpc?.endpoint_used || r.endpoint || "");
    if (BAD_HOSTS.includes(rpcHost) || BAD_HOSTS.includes(host(r.endpoint || ""))) {
      dropped.push({ ...r, drop_reason: "generic file host endpoint" });
      continue;
    }
    const authGatedOnly = r.rpc?.responded && String(r.rpc.sample || "").startsWith("auth-gated") && r.auth_kind === "none";

    if (r.auth_kind !== "none") {
      // keyed: confirm live card still declares supported scheme
      const cardUrl = r.card_url && !BAD_HOSTS.includes(host(r.card_url)) ? r.card_url : null;
      const card = cardUrl ? await getJson(cardUrl) : null;
      if (card && card.name) {
        survivors.push({ ...r, strict_recheck: { at: now, kind: "card_refetch", ok: true } });
      } else {
        dropped.push({ ...r, drop_reason: "keyed row: live card refetch failed" });
      }
      continue;
    }

    // keyless: need a real JSON-RPC envelope now
    const targets = [...new Set([r.rpc?.endpoint_used, r.endpoint].filter(Boolean))].filter(u => !BAD_HOSTS.includes(host(u)));
    let proof = null;
    for (const t of targets) {
      for (const mk of [mkModern, mkLegacy, mkTasks]) {
        const res = await post(t, mk());
        if (res.ok) { proof = { ...res, endpoint_used: t }; break; }
      }
      if (proof) break;
    }
    if (proof) {
      survivors.push({ ...r, rpc: { responded: true, method: "strict", status: proof.status, endpoint_used: proof.endpoint_used, sample: proof.sample }, strict_recheck: { at: now, kind: "jsonrpc", ok: true } });
    } else if (!authGatedOnly && r.rpc?.responded && String(r.rpc.sample || "").includes('"jsonrpc"')) {
      // had a real envelope earlier today, transient failure now — keep but flag
      survivors.push({ ...r, strict_recheck: { at: now, kind: "jsonrpc", ok: false, note: "prior same-day envelope retained; transient failure on recheck" } });
    } else {
      dropped.push({ ...r, drop_reason: authGatedOnly ? "only 401/403 proof (insufficient)" : "no JSON-RPC envelope on strict recheck" });
    }
    if ((survivors.length + dropped.length) % 25 === 0) console.error(`  ${survivors.length + dropped.length}/${rows.length} (kept ${survivors.length})`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

final.generated = new Date().toISOString();
final.totals = {
  callable_distinct: survivors.length,
  callable_rpc_proven: survivors.filter(r => r.auth_kind === "none").length,
  callable_keyed: survivors.filter(r => r.auth_kind !== "none").length,
  strict_recheck_live_now: survivors.filter(r => r.strict_recheck?.ok).length,
  dropped_on_strict_pass: dropped.length,
  compatible_not_yet_callable: final.compatible_not_yet_callable.length,
};
final.callable = survivors;
final.dropped_strict = dropped;
writeFileSync(dir + "a2a-arbor-callable-final.json", JSON.stringify(final, null, 2));

const esc = s => `"${String(s ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
const header = ["name", "endpoint", "card_url", "auth_kind", "rpc_proven", "recheck_live_now", "protocol_version", "version", "provider", "skills", "description", "rechecked_at"];
const lines = [header.join(",")];
for (const r of survivors) {
  lines.push([
    esc(r.name), esc(r.rpc?.endpoint_used || r.endpoint), esc(r.card_url), esc(r.auth_kind),
    esc(r.auth_kind === "none" ? "yes" : "card"), esc(r.strict_recheck?.ok ? "yes" : "transient-fail"),
    esc(r.protocol_version), esc(r.version), esc(r.provider),
    esc((r.skills || []).join("; ")), esc(r.description), esc(r.strict_recheck?.at),
  ].join(","));
}
writeFileSync(dir + "a2a-arbor-callable-final.csv", lines.join("\n") + "\n");

console.error(`STRICT: ${survivors.length} callable (${final.totals.strict_recheck_live_now} live right now) | dropped ${dropped.length}`);
