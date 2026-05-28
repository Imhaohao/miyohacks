# Arbor Specialist Tiers

Every specialist config in `registry.ts` must declare a `tier` field. The tier determines which runner factory is used at dispatch time — there is no silent fallback.

---

## `real`

A hand-written runner registered in `SPECIALIST_RUNNERS` (keyed by `agent_id`). The runner calls the sponsor's native API directly — no LLM-in-the-middle for dispatching. Use this when you have a typed SDK or a well-documented REST API and want full control over request/response mapping.

**Required config fields:** `agent_id` (must have a matching entry in `SPECIALIST_RUNNERS`)

**Env vars:** whatever the runner itself requires (usually an API key read from `process.env` inside the runner file)

**Canonical example:** `lib/specialists/reacher-social.ts`, `lib/specialists/vercel-v0.ts`

---

## `mcp-forwarding`

An LLM-driven tool-calling loop that forwards to a remote MCP server. At bid time, the runner discovers tools via `tools/list` and asks the model whether it can handle the task. At execute time, the model calls remote tools (proxied through `callRemoteTool`) until it produces a final answer or hits the round cap.

**Required config fields:** `mcp_endpoint` (URL of the remote MCP server)

**Optional config fields:** `mcp_api_key_env` — if set, the runner reads `process.env[mcp_api_key_env]` and sends it as a bearer token. If the env var is declared but absent at startup, the runner declines all bids loudly (no silent mock fallback).

**Env vars:** `OPENAI_API_KEY` (always), plus whatever `mcp_api_key_env` names

**Canonical example:** `lib/specialists/nia-context.ts` (after Stream B wires it)

**Fallback behavior:** if `tools/list` fails, `execute` returns a `[FALLBACK — MCP endpoint unreachable]` banner with `provenance.live_tools_called: false`.

---

## `a2a`

Outbound A2A v0.3.0 JSON-RPC runner (`lib/specialists/a2a-forwarding.ts`). Sends `message/send` to the remote agent, then polls `tasks/get` until the task reaches `completed` or `failed`. Extracts text from the first artifact part.

**Required config fields:** `a2a_endpoint` (full URL of the remote A2A gateway, e.g. `https://example.com/api/a2a`)

**Optional config fields:**
- `a2a_agent_card_url` — explicit URL of the agent card JSON. If omitted, the runner fetches from `${origin(a2a_endpoint)}/.well-known/agent.json` (the standard A2A discovery path).
- `a2a_api_key_env` — name of an environment variable whose value is used as a bearer token or API key, matching whatever auth scheme the agent card declares. Mirrors the `mcp_api_key_env` convention — no derived naming from `agent_id`.

**Agent-card discovery (automatic):** before the first bid, the runner fetches the remote agent's card JSON. This card's `security` and `securitySchemes` fields declare what auth is required:
- `security: []` (or no `securitySchemes`) → **keyless connection** — the endpoint is public and no token is needed. Any agent that publishes `security: []` works the moment it's registered.
- `{ type: "http", scheme: "bearer" }` → bearer token read from `process.env[a2a_api_key_env]`.
- `{ type: "apiKey", in: "header", name: "X-My-Key" }` → token sent in a custom header.
- `oauth2`, `mutualTLS`, or anything else → the runner declines with `"scheme not yet supported: <type>"`.

Cards are cached per card URL for 10 minutes. Concurrent bids to the same endpoint share a single in-flight fetch (promise dedup) so the card URL is never hammered.

Set `DEBUG_A2A_DISCOVERY=1` in env to log cache hits and fetches.

**Fail-closed on card-fetch failure:** if the card URL is unreachable, returns a 4xx/5xx, or times out (5 s), the runner **declines at bid time** and returns a `[FALLBACK — auth not satisfied]` banner at execute time. It never sends a `message/send` to an endpoint whose auth requirements are unknown. This is the key safety property: silent 401s (auth-less requests to authenticated endpoints) are impossible.

**Env vars:** none required by the runner itself beyond whatever `a2a_api_key_env` names.

**Canonical example:** `ARBOR_LOOPBACK_A2A_CONFIG` in `registry.ts` — points at Arbor's own `/api/a2a/market` to prove the round-trip without an external dependency. Arbor's own card declares `security: []`, so discovery resolves to `kind: "none"` and the loopback keeps working without any token.

**Adding a new external A2A agent:**
1. Create `lib/specialists/<agent-id>-a2a.ts`. Set `tier: "a2a"`, `a2a_endpoint`, and optionally `a2a_agent_card_url` + `a2a_api_key_env`.
2. Add the config to `SPECIALISTS` in `registry.ts`. No hand-written runner needed — `buildRunner` instantiates `makeA2aForwardingSpecialist` automatically.
3. If the agent card requires bearer auth, add the token env var to `.env.example` and your local `.env.local`.

**Failure behavior:** if the endpoint is unreachable at bid time, the runner declines (the auctioneer picks a different bidder). If `execute` fails (network error, timeout, or remote `failed` state), it returns a `[FALLBACK — A2A endpoint unreachable]` banner with `provenance.live_tools_called: false` and a `fallback_reason`. No LLM persona fallback is performed.

---

## `mock`

Uses `makeMockSpecialist` from `base.ts`: calls OpenAI to imitate the sponsor persona with no live tools. Every response is prefixed with `[MOCK — no live tools called]`. A `console.warn` fires once at module load per mock-tier config so `npm run dev` makes mocks clearly visible.

**Required config fields:** none beyond the standard `SpecialistConfig` fields

**Env vars:** `OPENAI_API_KEY`

**Use when:** the sponsor has no public MCP server, HTTP API, or A2A endpoint, and a real integration cannot be completed. Always leave a `// TODO(real-wiring):` comment in the config file explaining what was searched.

**Canonical example:** any of the 7 currently-mocked sponsors in `lib/specialists/`

---

## `disabled`

The specialist is registered in the config file but filtered out of `SPECIALISTS` before any runner is built. Disabled specialists never appear in bid rounds.

**Required config fields:** just `tier: "disabled"` plus the standard metadata

**Use when:** you want to temporarily remove a specialist without deleting its config (e.g. credentials revoked, endpoint down for maintenance).

---

## Adding a new specialist (summary)

1. Create `lib/specialists/<agent-id>.ts`. Export a `SpecialistConfig` const.
2. Choose a tier and set the required fields (see above).
3. If `tier:"real"`, also export a `SpecialistRunner` and add it to `SPECIALIST_RUNNERS` in `registry.ts`.
4. Add the config to `SPECIALISTS` in `registry.ts`.
5. Run `npm run typecheck` — zero errors is the bar.
