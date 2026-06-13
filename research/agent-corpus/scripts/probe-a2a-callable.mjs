#!/usr/bin/env node
/**
 * Probe candidate A2A origins/card URLs for Arbor compatibility + callability.
 *
 * Arbor contract (lib/specialists/a2a-agent-card.ts):
 *   - card at {origin}/.well-known/agent-card.json (v0.3.0) or /agent.json (v0.2.x), or explicit URL
 *   - auth resolvable to: none | http bearer | apiKey in header  (oauth2/mTLS/openIdConnect => decline)
 *   - endpoint must be a public URL (no localhost/127.0.0.1/0.0.0.0/internal)
 *
 * Callability levels recorded:
 *   - card_live:        card fetched + parsed from a live URL
 *   - endpoint_public:  card.url (or endpoint) is a public http(s) URL
 *   - rpc_responded:    JSON-RPC message/send (and fallback tasks/send) returned a JSON-RPC response
 *
 * verified = card_live && endpoint_public && auth in {none,bearer,apiKey}
 * callable = verified && (rpc_responded || auth != none)   // keyed endpoints: card+scheme is the proof
 *
 * Usage: node probe-a2a-callable.mjs candidates.txt out.json [--concurrency 16] [--no-rpc]
 *   candidates.txt: one entry per line — either an origin (https://x.com) or a full card URL (.json)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [, , inFile, outFile, ...flags] = process.argv;
if (!inFile || !outFile) {
  console.error("usage: probe-a2a-callable.mjs candidates.txt out.json [--concurrency N] [--no-rpc]");
  process.exit(1);
}
const CONC = flags.includes("--concurrency") ? Number(flags[flags.indexOf("--concurrency") + 1]) : 16;
const DO_RPC = !flags.includes("--no-rpc");
const TIMEOUT_MS = 8000;

const lines = readFileSync(inFile, "utf8")
  .split("\n").map(s => s.trim()).filter(s => s && !s.startsWith("#"));

const uniq = [...new Set(lines)];
console.error(`probing ${uniq.length} unique candidates, concurrency=${CONC}, rpc=${DO_RPC}`);

function isPublicUrl(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    const h = url.hostname;
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"].includes(h)) return false;
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (!h.includes(".")) return false;
    return true;
  } catch { return false; }
}

async function fetchJson(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: { accept: "application/json", "user-agent": "arbor-a2a-probe/1.0", ...(opts.headers || {}) },
      method: opts.method || "GET",
      body: opts.body,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, ok: res.ok, json, text: text.slice(0, 500), contentType: res.headers.get("content-type") || "" };
  } finally { clearTimeout(t); }
}

/** Mirror of Arbor resolveAuth — returns {kind, reason?} without env lookups. */
function resolveAuthKind(card) {
  try {
    const security = card.security;
    const schemes = card.securitySchemes ?? {};
    if (!security || security.length === 0) return { kind: "none" };
    if (Object.keys(schemes).length === 0) return { kind: "none" };
    const first = security[0];
    const names = Object.keys(first);
    if (names.length === 0) return { kind: "none" };
    const scheme = schemes[names[0]];
    if (!scheme) return { kind: "decline", reason: `unknown scheme "${names[0]}"` };
    if (scheme.type === "http" && (scheme.scheme || "").toLowerCase() === "bearer") return { kind: "bearer" };
    if (scheme.type === "apiKey" && scheme.in === "header") return { kind: "apiKey" };
    return { kind: "decline", reason: `unsupported: ${scheme.type}` };
  } catch { return { kind: "decline", reason: "unparseable security block" }; }
}

function looksLikeAgentCard(j) {
  if (!j || typeof j !== "object") return false;
  // name + (url | skills | capabilities | endpoints) is a decent card signature
  return typeof j.name === "string" && (typeof j.url === "string" || Array.isArray(j.skills) || j.capabilities || j.endpoints);
}

async function rpcPing(endpoint) {
  const mk = (method) => JSON.stringify({
    jsonrpc: "2.0", id: "arbor-probe-1", method,
    params: { message: { role: "user", parts: [{ kind: "text", text: "ping (capability probe; no action needed)" }], messageId: "probe-msg-1" } },
  });
  for (const method of ["message/send", "tasks/send"]) {
    try {
      const r = await fetchJson(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: mk(method),
      });
      // Any JSON-RPC envelope back (result OR structured error) proves a live A2A server.
      if (r.json && (r.json.jsonrpc === "2.0" || "result" in (r.json || {}) || "error" in (r.json || {}))) {
        return { responded: true, method, status: r.status, sample: JSON.stringify(r.json).slice(0, 300) };
      }
      if (r.status === 401 || r.status === 403) {
        return { responded: true, method, status: r.status, sample: "auth-gated (proof of live server)" };
      }
    } catch { /* try next */ }
  }
  return { responded: false };
}

async function probe(candidate) {
  const row = { candidate, probed_at: new Date().toISOString() };
  let cardUrls;
  if (candidate.endsWith(".json")) {
    cardUrls = [candidate];
  } else {
    let origin;
    try { origin = new URL(candidate).origin; } catch { return { ...row, status: "bad_url" }; }
    cardUrls = [`${origin}/.well-known/agent-card.json`, `${origin}/.well-known/agent.json`];
  }

  let card = null, cardUrl = null, httpStatus = null;
  for (const u of cardUrls) {
    try {
      const r = await fetchJson(u);
      httpStatus = r.status;
      if (r.ok && looksLikeAgentCard(r.json)) { card = r.json; cardUrl = u; break; }
    } catch (e) { httpStatus = String(e.message || e).slice(0, 100); }
  }
  if (!card) return { ...row, status: "no_card", http: httpStatus };

  const auth = resolveAuthKind(card);
  const endpoint = typeof card.url === "string" ? card.url : null;
  const endpointPublic = endpoint ? isPublicUrl(endpoint) : false;

  const out = {
    ...row,
    status: "card_live",
    card_url: cardUrl,
    name: card.name || "",
    description: String(card.description || "").slice(0, 300),
    provider: card.provider?.organization || card.provider?.name || "",
    version: card.version || "",
    protocol_version: card.protocolVersion || card.protocol_version || "",
    endpoint,
    endpoint_public: endpointPublic,
    auth_kind: auth.kind,
    auth_reason: auth.reason || "",
    skills: Array.isArray(card.skills) ? card.skills.map(s => s.name || s.id).filter(Boolean).slice(0, 12) : [],
    capabilities: card.capabilities || null,
    arbor_compatible: endpointPublic && ["none", "bearer", "apiKey"].includes(auth.kind),
  };

  if (DO_RPC && out.arbor_compatible && auth.kind === "none" && endpoint) {
    out.rpc = await rpcPing(endpoint);
  }
  return out;
}

const results = [];
let i = 0;
const HARD_CAP_MS = 30_000; // per-candidate hard ceiling regardless of internal timeouts
function hardCap(p, candidate) {
  return Promise.race([
    p,
    new Promise(res => setTimeout(() => res({ candidate, status: "hard_timeout" }), HARD_CAP_MS)),
  ]);
}
async function worker() {
  while (i < uniq.length) {
    const idx = i++;
    let r;
    try { r = await hardCap(probe(uniq[idx]), uniq[idx]); }
    catch (e) { r = { candidate: uniq[idx], status: "probe_error", error: String(e).slice(0, 200) }; }
    results.push(r);
    if (results.length % 25 === 0) console.error(`  ${results.length}/${uniq.length} probed`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

const live = results.filter(r => r.status === "card_live");
const compatible = live.filter(r => r.arbor_compatible);
const callable = compatible.filter(r => r.auth_kind !== "none" || (r.rpc && r.rpc.responded));

// merge with existing output if present
let prior = [];
if (existsSync(outFile)) {
  try { prior = JSON.parse(readFileSync(outFile, "utf8")).results || []; } catch { /* ignore */ }
}
const byKey = new Map();
for (const r of [...prior, ...results]) {
  const k = r.card_url || r.candidate;
  const prev = byKey.get(k);
  // prefer rows with rpc proof, then card_live
  const score = (x) => (x.rpc?.responded ? 3 : 0) + (x.arbor_compatible ? 2 : 0) + (x.status === "card_live" ? 1 : 0);
  if (!prev || score(r) >= score(prev)) byKey.set(k, r);
}
const merged = [...byKey.values()];
const mLive = merged.filter(r => r.status === "card_live");
const mCompat = mLive.filter(r => r.arbor_compatible);
const mCallable = mCompat.filter(r => r.auth_kind !== "none" || (r.rpc && r.rpc.responded));

writeFileSync(outFile, JSON.stringify({
  generated: new Date().toISOString(),
  totals: { probed_all_time: merged.length, card_live: mLive.length, arbor_compatible: mCompat.length, callable: mCallable.length },
  results: merged,
}, null, 2));

console.error(`\nthis run: ${results.length} probed | ${live.length} live cards | ${compatible.length} arbor-compatible | ${callable.length} callable`);
console.error(`merged:   ${merged.length} total | ${mLive.length} live | ${mCompat.length} compatible | ${mCallable.length} callable`);
