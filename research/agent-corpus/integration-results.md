# A2A Corpus Integration Results

Date: 2026-06-12. Source: `compiled-a2a-findings.csv` (19 rows). Probe script: `probe_corpus.py`, roster: `live-roster.json`.

## Corpus verdicts

| Agent | Status | Detail |
|---|---|---|
| inferGONKA (a2a.gogonka.com) | **live, integrated** | A2A 0.3.0, JSONRPC, no auth. Registered as `infergonka-a2a`. Bids, executes, full receipt provenance. |
| AnZai (anzai-agent.onrender.com) | dead | Render app 404s on every path; card only on GitHub raw. |
| meok-aaif (proofof.ai) | dead | Endpoint 307s to marketing site; not a JSON-RPC endpoint. |
| SIXPERCENT (api.sixpercent.ai) | dead | HTTP 522 origin down. |
| Agent Revenue Copilot | dead | trycloudflare DNS gone (ephemeral tunnel). |
| 6x a2aproject localhost samples | local-run candidates | Cards parseable; not running. Currency agent (port 10000) already integrated from a prior session. |
| 5x YC watchlist rows | skipped | Vision/team-signal only, no endpoints. |

## What works now (verified live)

- **Outbound bids**: `infergonka-a2a` bid in real auctions; `bidProbes` row shows `probe_status=pass`, `public_tier=native-a2a`, live JSON-RPC excerpt, 4.1s round trip from Convex cloud.
- **Outbound execution**: failover awarded a task to inferGONKA; it executed over A2A with `external_session_id`, `events_observed=2`, artifact present. Judge honestly rejected off-scope content (quality 0); escrow refunded, reputation -0.1, task `disputed`. Buyer protected at every step.
- **Inbound**: external client fetched our card at `/.well-known/agent-card.json` via public tunnel and posted a task (`post_task` intent) that ran to `complete` with escrow released.
- **Admin console**: `/admin` chats with any A2A specialist (`/api/admin/a2a-chat`). Verified multi-turn with inferGONKA (contextId threading; it issued a live trial key) and the currency agent (live FX answer).

## Bugs found and fixed this pass

1. Agent card served behind proxy/tunnel advertised `localhost:3000` as endpoint — now derives origin from `x-forwarded-*` headers (`lib/specialists/a2a-market-card.ts`).
2. `auctions:settle` crashed (`agent not found`) for registry-only bidders (arbor-worker-a2a, arbor-loopback-a2a), stranding tasks in `judging` forever — `_ensureAgent` sweep now covers the full roster, stuck tasks re-settled.
3. Reputation scale mismatch: five A2A configs used 0-100 (60-80) against the system's 0-1 scale, making arbor-worker unbeatable (score 60 vs 1.1) — normalized to 0.6-0.8.
4. `BID_WINDOW_SECONDS` 15 → 45: tunneled external agents need two JSON-RPC legs with LLM latency; 15s structurally excluded them (currency agent's bid kept arriving post-resolution).

## Known gaps (not fixed, by choice)

- Auction score is `reputation / price` with no capability-fit term: cheap generalists outbid the right specialist (nia-context won an FX task at 0.12). Fix requires an economics decision.
- Judge rejection does not trigger failover to the next bidder (execution failure does). A rejected delivery ends `disputed` even when a capable runner-up existed.
- `currency-agent-a2a-2` orphan row remains (no delete mutation on discoveredSpecialists).
- `/admin` is unauthenticated; no admin auth exists in the repo yet.
