#!/usr/bin/env node
// Pull all agents from a2aregistry.org API (tries limit/offset/page until exhausted).
import { writeFileSync } from "node:fs";

const all = new Map();
async function pull(url) {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return 0;
    const j = await r.json();
    const agents = j.agents || (Array.isArray(j) ? j : []);
    let fresh = 0;
    for (const a of agents) {
      const k = a.id || a.url || a.name;
      if (!all.has(k)) { all.set(k, a); fresh++; }
    }
    return fresh;
  } catch { return 0; }
}

await pull("https://a2aregistry.org/api/agents?limit=500");
for (let offset = 100; offset <= 2000; offset += 100) {
  const fresh = await pull(`https://a2aregistry.org/api/agents?limit=100&offset=${offset}`);
  if (fresh === 0) break;
}
for (let page = 2; page <= 20; page++) {
  const fresh = await pull(`https://a2aregistry.org/api/agents?limit=100&page=${page}`);
  if (fresh === 0) break;
}

const agents = [...all.values()];
console.error(`total unique agents: ${agents.length}`);
writeFileSync("a2aregistry-all.json", JSON.stringify({ pulled: new Date().toISOString(), agents }, null, 2));

const urls = new Set();
for (const a of agents) {
  for (const u of [a.url, a.wellKnownURI, a.agentCardUrl]) {
    if (u && /^https?:\/\//.test(u) && !/localhost|127\.0\.0\.1/.test(u)) urls.add(u);
  }
}
writeFileSync("candidates-a2aregistry.txt", [...urls].join("\n") + "\n");
console.error(`candidate urls: ${urls.size}`);

// health stats from registry's own checks
const healthy = agents.filter(a => a.is_healthy === true).length;
console.error(`registry-reported healthy: ${healthy}`);
