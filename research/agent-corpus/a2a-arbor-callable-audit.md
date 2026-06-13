# A2A Arbor-callable verification audit

Generated: 2026-06-12T09:25:31.237Z

## Definition
- **Arbor-compatible**: agent card fetched live (well-known path per A2A v0.3.0/v0.2.x, or explicit card URL); endpoint is a public http(s) URL; `security`/`securitySchemes` resolve to `none`, `http bearer`, or `apiKey` in header — mirroring `lib/specialists/a2a-agent-card.ts resolveAuth` (oauth2/mTLS/openIdConnect decline).
- **Callable**: compatible AND proven live — keyless endpoints answered a JSON-RPC `message/send` (or `tasks/send`) probe with a JSON-RPC envelope; keyed endpoints have a live card declaring an Arbor-supported scheme.

## Totals (after strict re-verification pass)
| Metric | Count |
|---|---|
| Distinct callable agents (strict) | 115 |
| ...keyless, live JSON-RPC envelope proof | 93 |
| ...keyed (live card, bearer/apiKey scheme) | 22 |
| Confirmed live at recheck time | 112 |
| Dropped by strict pass (401/403-only proof, generic-host endpoints, dead) | 64 |
| Compatible but not yet callable (watchlist) | 85 |

Strict rules: keyless rows must return a real JSON-RPC envelope to message/send or tasks/send (401/403 alone no longer counts); endpoints on raw.githubusercontent.com or similar file hosts are rejected; keyed rows must have a re-fetchable live card declaring a scheme Arbor's resolveAuth supports.

## Sources
- **a2aregistry.org API** — 119 agents pulled; densest single source
- **GitHub code search (filename:agent-card.json / agent.json, 2 rounds)** — ~3400 code hits -> card url extraction
- **HF Spaces API search** — a2a-tagged spaces probed at *.hf.space
- **Web scrape (sonnet subagents)** — telex.im, NANDA, awesome-a2a lists, deployed-sample hunting

## Method
1. Harvest candidate origins/card URLs (GitHub code search via gh api, a2aregistry.org API, HF Spaces API, web scrape).
2. Probe each origin at `/.well-known/agent-card.json` then `/.well-known/agent.json` (8s timeout, 30s hard cap).
3. Validate card shape (name + url/skills/capabilities) and auth schemes against Arbor's resolveAuth logic.
4. For keyless compatible endpoints, POST JSON-RPC `message/send` ping; any JSON-RPC envelope (result or structured error) or 401/403 counts as live-server proof.
5. Dedupe by endpoint origin, preferring RPC-proven rows and live well-known cards over repo-raw cards.

Scripts: `scripts/probe-a2a-callable.mjs`, `scripts/pull-a2aregistry.mjs`, `scripts/harvest-a2a-github.sh`, `scripts/harvest-a2a-github-v2.sh`, `scripts/finalize-a2a-callable.mjs`.

Re-verify: `node scripts/probe-a2a-callable.mjs <candidates.txt> <out.json>` then `node scripts/finalize-a2a-callable.mjs`.

## Connected to Arbor (discovered_specialists)

All 115 callable agents are loaded into Convex `discovered_specialists` (+ `agents`
mirror) via the idempotent `discoveredSpecialists:upsert` mutation. The auction
(`convex/auctions.ts solicitBids`) reads this table, maps each row to `tier:"a2a"`,
and every agent bids/negotiates via the `cost_estimate` intent in
`lib/specialists/a2a-forwarding.ts`. The admin console (`/admin`) lists them all.

Counts after import: 120 specialists in console (was 5); 115 corpus agents
(93 keyless auto-negotiable, 22 keyed needing `ARBOR_A2A_KEY_*` env vars).

### Pipeline (resumable — re-run any step safely)
1. `node scripts/build-arbor-import.mjs`   -> arbor-import-records.json (deterministic)
2. `node scripts/load-arbor-import.mjs`     -> upserts to Convex; ledger arbor-import-progress.json
   - resumes automatically (skips agent_ids already in ledger.done)
   - `--reset` to reload all; `--limit N` to load N this run
3. `node scripts/negotiate-probe.mjs [N]`   -> live cost_estimate negotiation check

### Restart after a usage limit
Just re-run `node scripts/load-arbor-import.mjs` — done agents are skipped, only
pending/failed are retried. Verify with:
`npx convex run discoveredSpecialists:list '{}'` (count rows with
discovered_for == "a2a-registry-corpus-import").

### Keyed agents (22)
Bid-decline until their key env var is set (fail-closed in resolveAuth). Env var
names are in arbor-import-records.json (`a2a_api_key_env`). Set the real key to
activate; no reload needed.

## Skipping the API-key step (3 mechanisms)

For the 22 agents whose cards declared auth, three lanes get them chatting/delivering:

1. **Auto-acquire (find/sign up the key for you)** — `scripts/acquire-keys.mjs --apply`
   hits no-approval registration endpoints (e.g. workprotocol's
   POST /api/agents/register) and stores the key in the Convex vault. Interactive
   signups (ragsphere, clix, humanbrowser, ydb-qdrant) are printed with their URL.
2. **User paste / login** — the console shows a "This agent needs an API key" form
   on any auth-declined agent; the key is POSTed to `/api/admin/a2a-keys` and stored
   in `a2a_outbound_keys`. The chat route and the auction hydrate
   `process.env[a2a_api_key_env]` from the vault at call time — no redeploy.
3. **Skip entirely (optimistic)** — `scripts/probe-keyed-enforcement.mjs --apply`
   sends a keyless message to each keyed agent; servers that DON'T actually enforce
   their declared scheme get `a2a_auth_mode="none"` and are called keyless forever.

Result on this corpus: 14 of 22 "keyed" agents were not enforcing -> flipped to
keyless (NeuroDecode among them). 8 truly enforce; workprotocol is auto-acquirable,
the rest have free/trial signups reachable via the paste form. New A2A connections
flow through the same three lanes automatically.

Implementation: `convex/a2aOutboundKeys.ts` (vault), `a2a_auth_mode` on
discovered_specialists, `getAuthForEndpoint` honors mode "none",
`app/api/admin/a2a-chat` + `convex/auctions.ts solicitBids` hydrate keys from vault,
`app/api/admin/a2a-keys` (key CRUD), console paste-key form in `app/admin/page.tsx`.
