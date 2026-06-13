#!/usr/bin/env node
/**
 * Full chat sweep — send a real message to every discovered A2A specialist
 * through Arbor's own admin chat route and tally how many reply, how many
 * still need a key, and how many error. Proof of end-to-end deliverability.
 *
 * Usage: node scripts/sweep-chat.mjs [baseUrl]   (default http://localhost:3000)
 */
const base = process.argv[2] || "http://localhost:3000";

const list = await (await fetch(`${base}/api/admin/a2a-chat`)).json();
const specs = list.specialists.filter((s) => s.a2a_endpoint);
console.error(`sweeping ${specs.length} A2A specialists via ${base}...`);

async function chat(agent_id) {
  try {
    const res = await fetch(`${base}/api/admin/a2a-chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent_id, text: "Hello — what can you do?" }),
      signal: AbortSignal.timeout(40_000),
    });
    const d = await res.json();
    if (d.ok && (d.reply_text || "").trim() && !/^\(no text/.test(d.reply_text))
      return { agent_id, outcome: "replied", reply: d.reply_text.replace(/\s+/g, " ").slice(0, 70) };
    if (d.ok) return { agent_id, outcome: "empty_reply" };
    if (d.needs_key) return { agent_id, outcome: "needs_key" };
    if (/timed out/.test(d.error || "")) return { agent_id, outcome: "timeout" };
    return { agent_id, outcome: "error", detail: (d.error || "").slice(0, 60) };
  } catch (e) {
    return { agent_id, outcome: "timeout", detail: String(e.name || e).slice(0, 40) };
  }
}

const results = [];
const CONC = 10;
let i = 0;
async function worker() {
  while (i < specs.length) {
    const s = specs[i++];
    results.push(await chat(s.agent_id));
    if (results.length % 20 === 0) console.error(`  ${results.length}/${specs.length}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

const tally = {};
for (const r of results) tally[r.outcome] = (tally[r.outcome] || 0) + 1;
console.error("\n=== TALLY ===");
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.error(`  ${k}: ${v}`);
console.error(`\nreplied (deliverable now): ${tally.replied || 0}/${results.length}`);
console.error(`still need key: ${tally.needs_key || 0}`);

import("node:fs").then((fs) =>
  fs.writeFileSync(new URL("../chat-sweep-report.json", import.meta.url).pathname,
    JSON.stringify({ generated: new Date().toISOString(), base, tally, results }, null, 2)));
