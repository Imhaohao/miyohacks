---
name: arbor-check
description: >
  Diagnose Arbor local health before shipping or debugging: environment variables,
  Convex deployment/account access, typecheck, unit tests, cloudflared/trycloudflare
  tunnels, live registered-agent reachability, and the end-to-end auction/hive
  regression. Use when the user asks to run /arbor-check, check Arbor health,
  debug Arbor env/Convex setup, verify tunnels, or produce a prioritized fix list
  after failed Arbor E2E runs.
---

# Arbor Check

Run Arbor's health checks from the repository root and return a prioritized fix
list. This skill is diagnostic by default; do not edit code unless the user asks
for repairs after the report.

## Primary Command

Run:

```sh
node .agents/skills/arbor-check/scripts/arbor-check.mjs
```

Useful flags:

```sh
node .agents/skills/arbor-check/scripts/arbor-check.mjs --skip-e2e
node .agents/skills/arbor-check/scripts/arbor-check.mjs --skip-tests
node .agents/skills/arbor-check/scripts/arbor-check.mjs --skip-typecheck
node .agents/skills/arbor-check/scripts/arbor-check.mjs --skip-convex
node .agents/skills/arbor-check/scripts/arbor-check.mjs --json
```

The default run performs:

1. Repo and env-file checks.
2. Convex account/deployment checks.
3. Registered-agent count/readiness snapshot.
4. Cloudflared binary/process/tunnel probes.
5. `npm run typecheck`.
6. `npm test`.
7. `npm run hive:e2e` as the live auction/DAG regression.
8. Prioritized fix-list output.

## Interpreting The Report

Priorities:

- `P0`: blocks local/Convex execution or makes validation impossible.
- `P1`: blocks live Arbor end-to-end behavior, agent routing, or tunnel-backed
  integrations.
- `P2`: weak signal, degraded diagnostics, or cleanup that should not block a
  fix.

If the E2E fails with zero accepted bids, classify it as a routing/market
quality issue unless the report also shows missing keys or unreachable tunnels.
Recommended first fixes are usually:

1. Add an Arbor-owned fallback lane for generic hive/auction nodes.
2. Write scratchpad diagnostics and root result text for terminal no-bid paths.
3. Separate external-agent live canaries from deterministic local regression
   fixtures.

## Guardrails

- Never print real secrets. The script redacts likely key material; still avoid
  pasting raw `.env.local` contents into chat.
- Creating external accounts, rotating keys, or changing provider dashboards is
  outside this diagnostic skill unless the user explicitly approves it.
- If a follow-up requires Convex code edits, read
  `convex/_generated/ai/guidelines.md` before changing Convex functions.
