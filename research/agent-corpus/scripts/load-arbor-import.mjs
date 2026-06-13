#!/usr/bin/env node
/**
 * Part 2 — Load arbor-import-records.json into Convex discovered_specialists
 * via the idempotent `upsert` mutation, over one ConvexHttpClient connection.
 *
 * RESUMABLE: writes a ledger (arbor-import-progress.json) after every success.
 * Re-running skips agent_ids already marked done, so if a usage/rate limit or
 * crash interrupts the run, just run this script again to finish.
 *
 * Usage:
 *   node scripts/load-arbor-import.mjs            # load all pending
 *   node scripts/load-arbor-import.mjs --reset    # forget ledger, reload all
 *   node scripts/load-arbor-import.mjs --limit 20 # load only N this run
 *
 * Env: reads NEXT_PUBLIC_CONVEX_URL from process.env or ../../.env.local
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const dir = new URL("..", import.meta.url).pathname;
const repoRoot = new URL("../../../", import.meta.url).pathname;

function loadConvexUrl() {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return process.env.NEXT_PUBLIC_CONVEX_URL;
  for (const p of [repoRoot + ".env.local", repoRoot + ".env"]) {
    if (existsSync(p)) {
      const m = readFileSync(p, "utf8").match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m);
      if (m) return m[1].trim();
    }
  }
  throw new Error("NEXT_PUBLIC_CONVEX_URL not found in env or .env.local");
}

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const url = loadConvexUrl();
const client = new ConvexHttpClient(url);
const upsert = makeFunctionReference("discoveredSpecialists:upsert");

const input = JSON.parse(readFileSync(dir + "arbor-import-records.json", "utf8"));
const records = input.records;

const ledgerPath = dir + "arbor-import-progress.json";
let ledger = { done: {}, failed: {}, started: new Date().toISOString() };
if (!reset && existsSync(ledgerPath)) {
  try { ledger = JSON.parse(readFileSync(ledgerPath, "utf8")); } catch { /* fresh */ }
}
ledger.done = ledger.done || {};
ledger.failed = ledger.failed || {};

function saveLedger() {
  ledger.updated = new Date().toISOString();
  ledger.done_count = Object.keys(ledger.done).length;
  ledger.failed_count = Object.keys(ledger.failed).length;
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

const pending = records.filter((r) => !ledger.done[r.agent_id]);
console.error(`convex: ${url}`);
console.error(`records: ${records.length} | already done: ${records.length - pending.length} | pending: ${pending.length}`);

let loaded = 0, failed = 0;
for (const rec of pending) {
  if (loaded >= limit) break;
  try {
    const res = await client.mutation(upsert, rec);
    ledger.done[rec.agent_id] = { at: new Date().toISOString(), updated: res?.updated === true };
    delete ledger.failed[rec.agent_id];
    loaded++;
    if (loaded % 10 === 0) { saveLedger(); console.error(`  ${loaded}/${pending.length} loaded`); }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ledger.failed[rec.agent_id] = { at: new Date().toISOString(), error: msg.slice(0, 300) };
    failed++;
    console.error(`  FAIL ${rec.agent_id}: ${msg.slice(0, 160)}`);
  }
}
saveLedger();

console.error(`\nthis run: +${loaded} loaded, ${failed} failed`);
console.error(`total done: ${Object.keys(ledger.done).length}/${records.length} | failed: ${Object.keys(ledger.failed).length}`);
if (Object.keys(ledger.failed).length) {
  console.error(`re-run to retry failures: node scripts/load-arbor-import.mjs`);
}
