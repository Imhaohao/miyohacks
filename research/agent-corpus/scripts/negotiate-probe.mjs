#!/usr/bin/env node
/**
 * Part 3 — Live price-negotiation probe.
 *
 * Replicates EXACTLY what Arbor's makeA2aForwardingSpecialist.bid() sends:
 * a message/send carrying metadata.intent="cost_estimate". Reads the reply's
 * metadata.cost_estimate (the negotiated price) and estimated_seconds.
 *
 * Outcomes (both are valid per the bid code):
 *   - "negotiated"  : remote returned a numeric metadata.cost_estimate -> live price
 *   - "alive_baseline": remote answered but no cost_estimate -> Arbor bids cost_baseline
 *   - "unreachable" : network/timeout -> Arbor declines, auctioneer routes elsewhere
 *
 * Usage: node scripts/negotiate-probe.mjs [N]   (default 12 keyless agents)
 */
import { readFileSync } from "node:fs";

const dir = new URL("..", import.meta.url).pathname;
const N = Number(process.argv[2]) || 12;
const TIMEOUT = 12_000;

const input = JSON.parse(readFileSync(dir + "arbor-import-records.json", "utf8"));
const keyless = input.records.filter((r) => !r.a2a_api_key_env).slice(0, N);

function buildTaskContext() {
  return "Task: estimate the cost to handle a representative consumer request in your domain. Reply with your price.";
}

async function bidProbe(rec) {
  const body = {
    jsonrpc: "2.0",
    id: `neg-${Date.now()}`,
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [{ kind: "text", text: buildTaskContext() }],
        messageId: `neg-msg-${Math.floor(performance.now())}-${rec.agent_id}`,
        kind: "message",
      },
      metadata: { intent: "cost_estimate", agent_id: "arbor-auctioneer" },
    },
  };
  try {
    const res = await fetch(rec.a2a_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { return { agent: rec.agent_id, outcome: "unreachable", detail: `non-JSON ${res.status}` }; }
    if (j.error) return { agent: rec.agent_id, outcome: "alive_baseline", detail: `jsonrpc error ${j.error.code}: alive, no cost intent -> bids cost_baseline ${rec.cost_baseline}` };
    const result = j.result || {};
    const meta = result.metadata || result.status?.message?.metadata || {};
    const cost = typeof meta.cost_estimate === "number" ? meta.cost_estimate : null;
    // pull any text reply for evidence
    const parts = result.parts || result.status?.message?.parts || result.artifacts?.[0]?.parts || [];
    const reply = (parts.find((p) => p.text)?.text || "").replace(/\s+/g, " ").slice(0, 90);
    if (cost !== null) return { agent: rec.agent_id, outcome: "negotiated", price: cost, est_s: meta.estimated_seconds, reply };
    return { agent: rec.agent_id, outcome: "alive_baseline", detail: `live reply, no cost_estimate -> bids cost_baseline ${rec.cost_baseline}`, reply };
  } catch (e) {
    return { agent: rec.agent_id, outcome: "unreachable", detail: String(e.name || e).slice(0, 50) };
  }
}

const results = await Promise.all(keyless.map(bidProbe));
const tally = { negotiated: 0, alive_baseline: 0, unreachable: 0 };
for (const r of results) {
  tally[r.outcome]++;
  const line = r.outcome === "negotiated"
    ? `NEGOTIATED  ${r.agent}  price=${r.price} est=${r.est_s ?? "?"}s  "${r.reply || ""}"`
    : r.outcome === "alive_baseline"
      ? `ALIVE/BASELINE  ${r.agent}  ${r.detail}${r.reply ? `  "${r.reply}"` : ""}`
      : `UNREACHABLE  ${r.agent}  ${r.detail}`;
  console.log(line);
}
console.log(`\ntally: ${tally.negotiated} negotiated price | ${tally.alive_baseline} alive(bids baseline) | ${tally.unreachable} unreachable`);
console.log(`bid-capable (would place a live bid in Arbor's auction): ${tally.negotiated + tally.alive_baseline}/${results.length}`);
