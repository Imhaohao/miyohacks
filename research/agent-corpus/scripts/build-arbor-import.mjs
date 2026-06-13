#!/usr/bin/env node
/**
 * Part 1 — Transform the verified A2A corpus into Arbor discovered_specialists
 * upsert records. Deterministic, free, re-runnable.
 *
 * Input:  a2a-arbor-callable-final.json  (strict-verified callable agents)
 * Output: arbor-import-records.json       (array of upsert-ready records)
 *
 * Each record matches convex/discoveredSpecialists.ts SPECIALIST_FIELDS so it
 * can be passed straight to the `upsert` mutation. The auction (solicitBids)
 * and the admin console both read discovered_specialists, so an upsert is all
 * that's needed to connect an agent and make it bid/negotiate.
 */
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("..", import.meta.url).pathname;
const corpus = JSON.parse(readFileSync(dir + "a2a-arbor-callable-final.json", "utf8"));
const rows = corpus.callable;

// agent_id must match /^[a-z0-9][a-z0-9-]{2,40}$/  (kebab, 3-41 chars)
function slugify(name) {
  let s = (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  if (s.length > 41) s = s.slice(0, 41).replace(/-+$/, "");
  return s;
}

function originOf(u) { try { return new URL(u).origin; } catch { return ""; } }

function clean(text, max) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

const seen = new Set();
const records = [];
const skipped = [];

for (const r of rows) {
  let id = slugify(r.name) || slugify(originOf(r.endpoint).replace(/^https?:\/\//, ""));
  if (id.length < 3) { skipped.push({ name: r.name, reason: "unslugifiable id" }); continue; }
  // dedupe by suffixing -2, -3, ... (kept <= 41 chars)
  if (seen.has(id)) {
    let n = 2, base = id;
    while (seen.has(`${base}-${n}`)) n++;
    let cand = `${base}-${n}`;
    if (cand.length > 41) { base = base.slice(0, 41 - `-${n}`.length); cand = `${base}-${n}`; }
    id = cand;
  }
  seen.add(id);

  const endpoint = r.rpc?.endpoint_used || r.endpoint;
  if (!endpoint || !/^https?:\/\//.test(endpoint)) { skipped.push({ name: r.name, reason: "no public endpoint" }); continue; }

  const skills = Array.isArray(r.skills) && r.skills.length ? r.skills : [];
  const capabilities = (skills.length ? skills : [r.name]).map((s) => clean(s, 80)).slice(0, 20);

  const keyed = r.auth_kind === "bearer" || r.auth_kind === "apiKey";
  const a2a_api_key_env = keyed
    ? `ARBOR_A2A_KEY_${id.toUpperCase().replace(/-/g, "_")}`.slice(0, 80)
    : undefined;

  const oneLiner =
    clean(r.description, 180) ||
    `A2A specialist ${r.name} reachable at ${endpoint}.`;

  const systemPrompt =
    `You are ${r.name}, an external specialist reachable over the A2A protocol at ${endpoint}.` +
    (r.provider ? ` Operated by ${r.provider}.` : "") +
    (capabilities.length ? ` Your skills: ${capabilities.join(", ")}.` : "") +
    ` ${oneLiner}` +
    ` Treat the user's goal on its own terms and decline cleanly when it is outside what your skills cover.`;

  records.push({
    agent_id: id,
    display_name: clean(r.name, 80) || id,
    sponsor: clean(r.provider, 80) || clean(r.name, 80) || id,
    capabilities,
    system_prompt: clean(systemPrompt, 1500),
    cost_baseline: 3.0, // neutral; the cost_estimate negotiation overrides per-bid
    starting_reputation: 0.5, // neutral for unproven external agents
    one_liner: oneLiner,
    discovered_for: "a2a-registry-corpus-import",
    discovery_source: "a2a",
    a2a_endpoint: endpoint,
    a2a_agent_card_url: r.card_url || undefined,
    ...(a2a_api_key_env ? { a2a_api_key_env } : {}),
    ...(originOf(r.card_url || endpoint) ? { homepage_url: originOf(r.card_url || endpoint) } : {}),
  });
}

// strip undefined keys (Convex optional args reject explicit undefined in some paths)
for (const rec of records) {
  for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
}

const keyless = records.filter((r) => !r.a2a_api_key_env).length;
writeFileSync(dir + "arbor-import-records.json", JSON.stringify({
  generated: new Date().toISOString(),
  source: "a2a-arbor-callable-final.json",
  total: records.length,
  keyless_auto_negotiable: keyless,
  keyed_needs_env_key: records.length - keyless,
  skipped,
  records,
}, null, 2));

console.log(`built ${records.length} import records (${keyless} keyless / ${records.length - keyless} keyed); skipped ${skipped.length}`);
