#!/usr/bin/env node
// Merge probe rounds, dedupe by endpoint origin, emit final JSON + CSV + audit.
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("..", import.meta.url).pathname;
const main = JSON.parse(readFileSync(dir + "a2a-arbor-callable.json", "utf8"));
const r2 = JSON.parse(readFileSync(dir + "a2a-arbor-callable-r2.json", "utf8"));
const all = [...main.results, ...r2.results];

const isCallable = r => r.status === "card_live" && r.arbor_compatible && (r.auth_kind !== "none" || (r.rpc && r.rpc.responded));
const isCompatOnly = r => r.status === "card_live" && r.arbor_compatible && !isCallable(r);

function dedupe(rows) {
  const seen = new Map();
  for (const r of rows) {
    let key; try { key = new URL(r.endpoint).origin; } catch { key = r.name || r.candidate; }
    const score = x => (x.rpc?.responded ? 2 : 0) + (x.card_url?.includes(".well-known") && !x.card_url.includes("raw.github") ? 1 : 0);
    const prev = seen.get(key);
    if (!prev || score(r) > score(prev)) seen.set(key, r);
  }
  return [...seen.values()];
}

const callable = dedupe(all.filter(isCallable));
const compatOnly = dedupe(all.filter(isCompatOnly)).filter(c => {
  try { return !callable.some(k => new URL(k.endpoint).origin === new URL(c.endpoint).origin); } catch { return true; }
});

const final = {
  generated: new Date().toISOString(),
  definition: {
    arbor_compatible: "agent card live at well-known path or explicit URL; endpoint is public http(s); auth resolves to none|bearer|apiKey-in-header per lib/specialists/a2a-agent-card.ts resolveAuth",
    callable: "arbor_compatible AND (live JSON-RPC response to message/send|tasks/send for keyless, OR live card + supported key scheme for keyed)",
  },
  totals: {
    callable_distinct: callable.length,
    callable_rpc_proven: callable.filter(r => r.rpc?.responded).length,
    callable_keyed: callable.filter(r => r.auth_kind !== "none").length,
    compatible_not_yet_callable: compatOnly.length,
  },
  callable,
  compatible_not_yet_callable: compatOnly,
};
writeFileSync(dir + "a2a-arbor-callable-final.json", JSON.stringify(final, null, 2));

// CSV
const esc = s => `"${String(s ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
const header = ["name", "endpoint", "card_url", "auth_kind", "rpc_proven", "rpc_method", "protocol_version", "version", "provider", "skills", "description", "probed_at"];
const lines = [header.join(",")];
for (const r of callable) {
  lines.push([
    esc(r.name), esc(r.endpoint), esc(r.card_url), esc(r.auth_kind),
    esc(r.rpc?.responded ? "yes" : "no"), esc(r.rpc?.method || ""),
    esc(r.protocol_version), esc(r.version), esc(r.provider),
    esc((r.skills || []).join("; ")), esc(r.description), esc(r.probed_at),
  ].join(","));
}
writeFileSync(dir + "a2a-arbor-callable-final.csv", lines.join("\n") + "\n");

// audit
const byAuth = {};
for (const r of callable) byAuth[r.auth_kind] = (byAuth[r.auth_kind] || 0) + 1;
const sources = {
  "a2aregistry.org API": "119 agents pulled; densest single source",
  "GitHub code search (filename:agent-card.json / agent.json, 2 rounds)": "~3400 code hits -> card url extraction",
  "HF Spaces API search": "a2a-tagged spaces probed at *.hf.space",
  "Web scrape (sonnet subagents)": "telex.im, NANDA, awesome-a2a lists, deployed-sample hunting",
};
writeFileSync(dir + "a2a-arbor-callable-audit.md", `# A2A Arbor-callable verification audit

Generated: ${final.generated}

## Definition
- **Arbor-compatible**: agent card fetched live (well-known path per A2A v0.3.0/v0.2.x, or explicit card URL); endpoint is a public http(s) URL; \`security\`/\`securitySchemes\` resolve to \`none\`, \`http bearer\`, or \`apiKey\` in header — mirroring \`lib/specialists/a2a-agent-card.ts resolveAuth\` (oauth2/mTLS/openIdConnect decline).
- **Callable**: compatible AND proven live — keyless endpoints answered a JSON-RPC \`message/send\` (or \`tasks/send\`) probe with a JSON-RPC envelope; keyed endpoints have a live card declaring an Arbor-supported scheme.

## Totals
| Metric | Count |
|---|---|
| Distinct callable agents | ${callable.length} |
| ...with live JSON-RPC proof | ${final.totals.callable_rpc_proven} |
| ...keyed (card-live, supported scheme) | ${final.totals.callable_keyed} |
| Compatible but not yet callable | ${compatOnly.length} |

Auth breakdown: ${JSON.stringify(byAuth)}

## Sources
${Object.entries(sources).map(([k, v]) => `- **${k}** — ${v}`).join("\n")}

## Method
1. Harvest candidate origins/card URLs (GitHub code search via gh api, a2aregistry.org API, HF Spaces API, web scrape).
2. Probe each origin at \`/.well-known/agent-card.json\` then \`/.well-known/agent.json\` (8s timeout, 30s hard cap).
3. Validate card shape (name + url/skills/capabilities) and auth schemes against Arbor's resolveAuth logic.
4. For keyless compatible endpoints, POST JSON-RPC \`message/send\` ping; any JSON-RPC envelope (result or structured error) or 401/403 counts as live-server proof.
5. Dedupe by endpoint origin, preferring RPC-proven rows and live well-known cards over repo-raw cards.

Scripts: \`scripts/probe-a2a-callable.mjs\`, \`scripts/pull-a2aregistry.mjs\`, \`scripts/harvest-a2a-github.sh\`, \`scripts/harvest-a2a-github-v2.sh\`, \`scripts/finalize-a2a-callable.mjs\`.

Re-verify: \`node scripts/probe-a2a-callable.mjs <candidates.txt> <out.json>\` then \`node scripts/finalize-a2a-callable.mjs\`.
`);

console.log(`final: ${callable.length} distinct callable | ${final.totals.callable_rpc_proven} rpc-proven | ${final.totals.callable_keyed} keyed | +${compatOnly.length} compatible-not-callable`);
