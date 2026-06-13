#!/usr/bin/env node
/**
 * Key-skip way #1 — auto-acquire API keys for truly-keyed A2A agents.
 *
 * Some agents expose an instant, no-approval registration endpoint that hands
 * back a key programmatically. This script hits those, stores the key in the
 * Convex vault (a2aOutboundKeys.setKey, source="auto_acquired"), and the chat
 * route + auction hydrate it at call time. Agents that require interactive
 * signup (email, wallet, OAuth) are printed with their signup URL so the user
 * can paste the resulting key via the console's "Save key" form (way #2).
 *
 * Recipes are derived from the trial-key hunt (keyed-signup-report). Add more
 * as agents are discovered. Usage: node scripts/acquire-keys.mjs [--apply]
 */
import { readFileSync, existsSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const repoRoot = new URL("../../../", import.meta.url).pathname;
const apply = process.argv.includes("--apply");

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

// Programmatic, no-approval registration recipes.
const PROGRAMMATIC = [
  {
    agent_id: "workprotocol",
    register: async () => {
      const res = await fetch("https://workprotocol.ai/api/agents/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "arbor-auctioneer" }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await res.json();
      return j.apiKey || j.api_key || j.key || null;
    },
  },
];

// Interactive signups — can't be fully automated; surface to the user.
const INTERACTIVE = [
  { agent_id: "ragsphere", signup: "https://ragsphere.vercel.app/auth/signin", note: "free tier 100 req/12h; dashboard issues x-a2a-key" },
  { agent_id: "clix-agent", signup: "https://console.clix.so/signup", note: "free plan; key from console (Auth0)" },
  { agent_id: "humanbrowser", signup: "https://humanbrowser.cloud/account", note: "$1 trial, email only, no card" },
  { agent_id: "ydb-qdrant", signup: "https://code-indexer.ydb-qdrant.tech/github/oauth/start", note: "free beta; GitHub OAuth -> MCP bearer token" },
  { agent_id: "vicoop-bridge-server-admin", signup: "", note: "wallet-gated (SIWE); no key, needs EVM wallet" },
  { agent_id: "execution-market", signup: "https://execution.market", note: "wallet-native (ERC-8128/OWS); no API key" },
  { agent_id: "partstable-intelligence", signup: "https://partstable.com", note: "no self-serve; contact PartsTable Design LLC" },
];

const client = apply ? new ConvexHttpClient(convexUrl()) : null;
const setKey = makeFunctionReference("a2aOutboundKeys:setKey");

console.error("=== programmatic auto-acquire ===");
for (const r of PROGRAMMATIC) {
  try {
    const key = await r.register();
    if (!key) { console.error(`  ${r.agent_id}: register returned no key`); continue; }
    console.error(`  ${r.agent_id}: acquired ${String(key).slice(0, 10)}...(${String(key).length} chars)`);
    if (apply) {
      await client.mutation(setKey, { agent_id: r.agent_id, api_key: String(key), source: "auto_acquired" });
      console.error(`    -> stored in vault`);
    }
  } catch (e) {
    console.error(`  ${r.agent_id}: FAILED ${String(e).slice(0, 80)}`);
  }
}

console.error("\n=== interactive signups (use the console 'Save key' form after) ===");
for (const r of INTERACTIVE) {
  console.error(`  ${r.agent_id}: ${r.signup || "(no public signup)"}  — ${r.note}`);
}
console.error(apply ? "\napplied." : "\ndry run — pass --apply to store acquired keys in the vault.");
