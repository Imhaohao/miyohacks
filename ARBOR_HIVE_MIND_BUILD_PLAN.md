You are an executive agent. Do not expend tokens unless       
  absolutely necessary. Use subagents or local agents when      
  necessary. Log required API keys into docs/api-keys.md. We've 
  finished with tasks 1-7 so far. Work on tasks 15-22           
  (inclusive). If a task needs a pre-req and it isn't built     
  yet, do the ones that aren't blocked first. Report progress   
  when a task is done. The goal is to create a working agent    
  hivemind end-to-end. Use this plan:    
# Arbor Hive Mind Build Plan

<!-- ARCHITECTURE MAP

DATABASE
- Single backend: Convex (package `convex` ^1.17.4). No Postgres, no Prisma, no Drizzle, no Redis, no Pinecone.

- Schema file: convex/schema.ts. Tables (all columns as written there):
  - agents: agent_id, display_name, sponsor, capabilities[], system_prompt, cost_per_task_estimate, reputation_score (0.05..1.0), total_tasks_completed, total_disputes_lost, agent_role?. Index by_agent_id.
  - tasks: posted_by, task_type, prompt, output_schema?, max_budget, status (open|planning|plan_review|bidding|awarded|requires_payment|executing|judging|synthesizing|complete|disputed|cancelled|failed), bid_window_seconds, bid_window_closes_at, winning_bid_id?, price_paid?, payment_status?, project_id?, workflow_mode?, result?, judge_verdict?, parent_task_id?, step_index?, product_context_profile_id?, task_plan? (array of {prompt, rationale, specialist_hint?}). Index by_parent.
  - bids: task_id, agent_id, agent_role?, bid_price, capability_claim, estimated_seconds, score, plan_source?, plus many optional analytics columns (acceptance_rate, task_fit_score, etc. — declared in schema, mostly not written by bids._insert). Index by_task.
  - bid_probes: task_id, bid_id?, agent_id, public_tier, probe_status (pass|fail|demo_lane), duration_ms, response_excerpt?, error_message?, created_at.
  - discovered_specialists: agent_id, display_name, sponsor, capabilities[], system_prompt, cost_baseline, starting_reputation, one_liner, discovered_for, created_at, discovery_source? (catalog|registry|synthesized|a2a), mcp_endpoint?, mcp_api_key_env?, homepage_url?, rationale?, a2a_endpoint?, a2a_agent_card_url?, a2a_api_key_env?, a2a_auth_mode?. Index by_agent_id.
  - escrow, stripe_connected_accounts, reputation_events (agent_id, task_id, event_type, delta, reasoning, new_score), reputation_dimensions (agent_id, task_id, actual_seconds, estimated_seconds, speed_score, estimate_accuracy, quality_score, value_score, overall, accepted, bid_price, price_paid, created_at; indexes by_agent, by_task), lifecycle_events (task_id, event_type, payload, timestamp), agent_tool_calls (full audit trail), agent_keys / a2a_outbound_keys / a2a_nonces (HMAC + key vault), a2a_task_runs, product_context_profiles, task_contexts, task_intakes, task_intake_messages.

VICKREY AUCTION (do not replace)
- File: convex/auctions.ts ("use node" internalActions).
  - solicitBids (line ~329): builds roster = SPECIALISTS + discovered (from api.discoveredSpecialists.list) + MCP_CATALOG auto-enrolled; ensures agents rows via internal.agents._ensureAgent; per specialist runs probe + bid concurrently; plan-plausibility screen via assessPlanPlausibility (callOpenAIJSON purpose:"judge"); inserts bid with score = (reputation / max(0.01, bid_price)) * tierWeight (live probed tiers weight 1.0, demo lane 0.05).
  - resolve: filters bids by bid_price <= task.max_budget, sorts by score desc, winner = sorted[0], price_paid = sorted[1].bid_price (second price; degenerate single-bid pays own bid); locks escrow (internal.escrow._lock), sets winner (internal.tasks._setWinner), schedules execute.
  - execute: 180s cap, getRunner(winner.agent_id).execute, receipt rule (external_session_id + events_observed + artifact_present required), bounded failover to next-best bid (MAX_EXECUTION_ATTEMPTS=3).
  - judge: JUDGE_GENERAL_PROMPT via callOpenAIJSON purpose:"judge"; verdict {verdict, reasoning, quality_score}.
  - settle: writes reputation_dimensions._record, accepts → +0.05*quality delta via internal.agents._applyReputationDelta; rejects → -0.10; if task.parent_task_id schedules internal.planning.advanceOrSynthesize.
- Bid window: BID_WINDOW_SECONDS = 30, exported from convex/tasks.ts.

MCP FORWARDING (do not replace)
- File: lib/specialists/mcp-forwarding.ts, factory makeMcpForwardingSpecialist(config). Tool discovery via discoverTools / callRemoteTool / flattenToolResult in lib/mcp-outbound.ts (streamable-HTTP JSON-RPC client, optional Mcp-Session-Id handshake). Execute loop: OpenAI chat completions (model "gpt-5.5", direct fetch to api.openai.com) with remote MCP tools, MAX_EXECUTE_ROUNDS=6.
- A2A forwarding: lib/specialists/a2a-forwarding.ts, factory makeA2aForwardingSpecialist(config). A2A v0.3.0 JSON-RPC: message/send + tasks/get polling (pollUntilTerminal, extractText). Card-driven auth via lib/specialists/a2a-agent-card.ts (getAuthForEndpoint, fetchAgentCard).
- Runner factory: lib/specialists/registry.ts buildRunner(cfg) switches on cfg.tier ("real" | "mcp-forwarding" | "a2a" | "a2a-bridge" | "mock" | "disabled"); getRunner(agent_id); registerDiscoveredSpecialist(cfg) populates in-process DISCOVERED map; SPECIALISTS static roster array. toPublicTier in lib/specialists/tiers.ts.

SPECIALIST REGISTRATION / STORAGE
- Static sponsors: lib/specialists/*.ts configs assembled in lib/specialists/registry.ts (SPECIALISTS).
- Curated catalog: lib/specialists/catalog.ts (MCP_CATALOG).
- Runtime-discovered: convex/discoveredSpecialists.ts — create (rejects dup agent_id, mirrors into agents table) and upsert (idempotent, patches mirror). discoverSpecialist in lib/specialists/discover.ts (4-stage: catalog → registry → a2a → synthesized).
- SpecialistConfig type: lib/types.ts (~line 207).

REPUTATION
- Stored on agents.reputation_score (clamped 0.05..1.0 in convex/agents.ts _applyReputationDelta), event log in reputation_events, multi-dimensional per-task records in reputation_dimensions (computed in convex/reputationDimensions.ts _record: quality .45 / speed .20 / estimate .15 / value .20). Routing blend: lib/specialists/suggest.ts reputationBonus (reward-only multiplier, REP_ALPHA=0.35).

ROUTING FLOW (current, end to end)
1. POST task → convex/tasks.ts post (status "planning", bid window 30s) → schedules internal.planning.decompose (or demos.runConversionDropDemo for conversion-drop prompts).
2. convex/planning.ts decompose: single LLM call (callOpenAIJSON purpose:"planner") → atomic | 2-4 sequential steps (task_plan). Atomic → internal.contextEnrichment.enrichAndStartAuction → solicitBids + resolve at window close. Compound → runStep creates child tasks SEQUENTIALLY (no parallelism, no DAG), each child auctions; settle → advanceOrSynthesize → next step or synthesize (callOpenAI purpose:"planner") → judge parent.
3. solicitBids → resolve (Vickrey) → execute (winner runner, failover) → judge → settle (reputation + escrow ± Stripe).

LLM LAYER
- lib/openai.ts: callOpenAI / callOpenAIJSON / parseJSONLoose. Provider-switchable (openai | azure-openai | foundry | disabled) via ARBOR_MODEL_PROVIDER; per-purpose models (ModelPurpose = default|agent|judge|suggester|intake|planner|discovery|demo). Default model "gpt-5.5". NO Anthropic SDK anywhere; no ANTHROPIC_API_KEY in .env.example or .env.local.
- Embeddings: none in production. eval/router-bench/embed.ts has a deterministic hashing embedder (offline benchmark only).

API ROUTES (app/)
- /api/mcp — inbound MCP server; tools defined in lib/mcp-tools.ts (upsert_product_context, post_task, get_task, list_specialists, suggest_specialists, discover_specialist, raise_dispute, override_judge) with dispatchTool(name, args).
- /api/a2a/market — A2A v0.3.0 JSON-RPC gateway (message/send, tasks/send, tasks/get); GET returns agent card; intent map in lib/specialists/a2a-market-card.ts; optional HMAC (ARBOR_A2A_HMAC_REQUIRED) via convex/a2aAuth.ts.
- /api/v1 (REST): GET / (index), POST /tasks, GET /tasks/[id], POST /tasks/[id]/dispute, POST /tasks/[id]/override, GET /specialists, POST /suggest, POST /discover. All thin wrappers over lib/mcp-tools.ts handlers. lib/http.ts has jsonOk/jsonError/corsPreflight/publicBaseUrl.
- /.well-known/agent-card.json, mcp.json, ai-plugin.json; /api/openapi.json; Stripe routes; admin routes.
- SDK packages: packages/sdk-core (+ langchain, mastra, vercel-ai wrappers), packages/cli.

LIVE VS SIMULATED
- Genuinely live when env keys present: mcp-forwarding specialists (reacher-social, nia-context, insforge-backend, catalog MCPs), a2a specialists (arbor-loopback-a2a, worker-a2a, tensorlake/devin/convex A2A via env endpoints), devin bridge. Most catalog/discovered entries lack keys at runtime → demo lane (mock persona bids with tierWeight 0.05) or decline.
- Payments simulated by default (Convex escrow rows); real Stripe only when ARBOR_PAYMENTS_MODE=stripe_checkout.

CONSTRAINTS DISCOVERED
- Root tsconfig.json EXCLUDES convex/, my-app/, packages/ — `npm run typecheck` covers app/lib only; Convex code typechecks via `npx convex dev --once` (script: npm run convex:once may not exist; use `npx convex dev --once` or `npx convex typecheck`... package.json has convex:dev only; CLAUDE.md mentions convex:once but package.json lacks it — use `npx convex dev --once`).
- `npm test` = tsx file list (lib/intake-normalize.test.ts, lib/tool-call-audit.test.ts, lib/openai-runtime.test.ts, lib/specialists/a2a-agent-card.test.ts). New tests must be appended there.
- Convex rules (convex/_generated/ai/guidelines.md): validators on every function; no ctx.db in actions; "use node" only in action-only files; withIndex not filter; vectorIndex/ctx.vectorSearch available (actions only); never store unbounded arrays in one doc.
- Convex env vars are SEPARATE from .env.local — set via `npx convex env set KEY value`.
-->

This file is the complete build plan for extending Arbor into a hive mind coordination layer. Each "Agent Task" section below is a self-contained prompt for a coding agent that has never seen this repository. Execute tasks in dependency order; tasks marked Parallelizable can start immediately and run concurrently.

Global rules for every task (repeated in each section's constraints):

- Repo root: the Arbor Next.js 15 + Convex app. TypeScript strict. No JavaScript files. No emojis anywhere.
- NEVER modify: `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts`, `vercel.json`, existing specialist runner files (`lib/specialists/nia-context.ts` etc.), the Stripe routes. `convex/auctions.ts` may be modified ONLY by Agent Task 12, and only as specified there.
- NEVER drop or rename existing schema columns; only add optional columns or new tables.
- Convex function rules (from `convex/_generated/ai/guidelines.md`): argument validators on every function; `internalQuery`/`internalMutation`/`internalAction` for private functions; no `ctx.db` inside actions (use `ctx.runQuery`/`ctx.runMutation`); `"use node";` only in files that export ONLY actions; query with `withIndex`, never `.filter`; `ctx.vectorSearch` is action-only.
- Convex backend env vars are set with `npx convex env set KEY value`, not `.env.local`.
- Verify with `npm run typecheck` (covers app/ and lib/; convex/ is excluded from root tsconfig) and `npx convex dev --once` (pushes + typechecks convex/).

---

## Agent Task 1: Anthropic model layer (`lib/anthropic.ts`)

**Delegate to:** codex
**Parallelizable:** Yes
**Depends on:** None

### Context

Arbor is an agent marketplace (Next.js 15 + Convex backend) where specialist agents bid on tasks in a Vickrey second-price auction. All existing LLM calls go through `lib/openai.ts`, which exports `callOpenAI(opts)`, `callOpenAIJSON<T>(opts)`, and `parseJSONLoose<T>(text)` with a `CallOptions` shape of `{ systemPrompt, userPrompt, maxTokens?, timeoutMs?, retries?, purpose? }` and a `ModelPurpose` union (`"default" | "agent" | "judge" | "suggester" | "intake" | "planner" | "discovery" | "demo"`). That file is provider-switchable (OpenAI / Azure) and is used by `convex/auctions.ts`, `convex/planning.ts`, `lib/specialists/base.ts`, and others — none of which may change.

The hive mind extension (planner, router, evaluator built in later tasks) must use the Anthropic API exclusively: model `claude-fable-5` for planning and evaluation, model `claude-haiku-4-5-20251001` for classification and routing. This task creates the Anthropic call layer those later tasks will import. It must work both in Next.js API routes and inside Convex `"use node"` actions (Convex bundles npm dependencies for node actions), so implement it with plain `fetch` against `https://api.anthropic.com/v1/messages` rather than the SDK client — zero new dependencies means zero Convex bundling risk. The API key comes from `process.env.ANTHROPIC_API_KEY`, which must also be documented in `.env.example` and set on the Convex deployment (`npx convex env set ANTHROPIC_API_KEY ...`).

### Goal

A new module `lib/anthropic.ts` that exposes `callClaude(opts)` and `callClaudeJSON<T>(opts)` with the same ergonomic shape as `lib/openai.ts` (system prompt, user prompt, max tokens, timeout, retries) plus an explicit `model` field, hitting the Anthropic Messages API directly with proper error handling, timeout, and loose JSON extraction, with the two hive model ids exported as named constants, and `.env.example` updated to document `ANTHROPIC_API_KEY`.

### Files to Create or Modify

- `lib/anthropic.ts` — create
- `lib/anthropic.test.ts` — create (offline unit test of JSON extraction and request-body construction only; no live API calls)
- `.env.example` — modify (append an `# Anthropic (hive mind layers)` block with `ANTHROPIC_API_KEY=` and a note that it must also be set on the Convex deployment)
- `package.json` — modify (append `lib/anthropic.test.ts` to the `test` script's `tsx` chain)

### Files to Leave Alone

- `lib/openai.ts` — existing call sites depend on its exact behavior; the hive layer is additive.
- `convex/auctions.ts` — Vickrey auction logic; only Agent Task 12 may touch it.
- `lib/specialists/mcp-forwarding.ts` — MCP forwarding logic is a hard no-touch constraint.
- `lib/specialists/a2a-forwarding.ts` — A2A forwarding logic is a hard no-touch constraint.

### Implementation Steps

1. Create `lib/anthropic.ts`. Export constants: `export const CLAUDE_PLANNER_MODEL = "claude-fable-5";` and `export const CLAUDE_FAST_MODEL = "claude-haiku-4-5-20251001";`.
2. Define `export interface ClaudeCallOptions { model: string; systemPrompt: string; userPrompt: string; maxTokens?: number; timeoutMs?: number; retries?: number; }` (defaults: maxTokens 1024, timeoutMs 30_000, retries 1).
3. Implement `export async function callClaude(opts: ClaudeCallOptions): Promise<string>`: POST `https://api.anthropic.com/v1/messages` with headers `{ "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }` and body `{ model, max_tokens, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }`. Throw `new Error("ANTHROPIC_API_KEY is not set")` when the key is absent. Wrap fetch in a `Promise.race` timeout exactly like `withTimeout` in `lib/openai.ts`. On non-2xx, throw `Error("Anthropic API error <status>: <first 300 chars of body>")`. Extract text by concatenating `content` blocks where `block.type === "text"`; throw if empty. Retry loop identical in structure to `callOpenAI` in `lib/openai.ts` (lines 423-445).
4. Implement `export async function callClaudeJSON<T>(opts: ClaudeCallOptions): Promise<T>` that calls `callClaude` then parses with `parseJSONLoose<T>` imported from `lib/openai.ts` (re-using the existing fence/brace extraction — do not duplicate it).
5. Respect the existing spend kill switch: if `process.env.ARBOR_MODEL_SPEND_DISABLED` is truthy (`"1" | "true" | "yes" | "on" | "enabled"`, lowercase-compared), throw before any network call, mirroring `envFlag` in `lib/openai.ts`.
6. Create `lib/anthropic.test.ts` following the style of `lib/intake-normalize.test.ts` (plain `tsx`-runnable assertions, `process.exit(1)` on failure): test that `callClaude` throws fast when `ANTHROPIC_API_KEY` is unset, and that `parseJSONLoose` round-trips a fenced JSON block.
7. Update `package.json` `test` script: `"test": "tsx lib/intake-normalize.test.ts && tsx lib/tool-call-audit.test.ts && tsx lib/openai-runtime.test.ts && tsx lib/specialists/a2a-agent-card.test.ts && tsx lib/anthropic.test.ts"`.
8. Append the Anthropic block to `.env.example`.

### New Types and Schemas

```typescript
// lib/anthropic.ts
export const CLAUDE_PLANNER_MODEL = "claude-fable-5";
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5-20251001";

export interface ClaudeCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;   // default 1024
  timeoutMs?: number;   // default 30_000
  retries?: number;     // default 1
}

export async function callClaude(opts: ClaudeCallOptions): Promise<string>;
export async function callClaudeJSON<T>(opts: ClaudeCallOptions): Promise<T>;
```

### Success Criteria

- `npm run typecheck` passes.
- `npx tsx lib/anthropic.test.ts` exits 0 with `ANTHROPIC_API_KEY` unset (the unset-key test asserts the throw).
- `grep -n "ANTHROPIC_API_KEY" .env.example` shows the new block.
- No new entries in `package.json` `dependencies`.

### Notes

- Deliberately fetch-based, not `@anthropic-ai/sdk`: keeps Convex node-action bundling trivial and matches the repo's existing fetch-based provider pattern in `lib/openai.ts`. The "Anthropic SDK only" stack rule is interpreted as "Anthropic API only for hive AI calls".
- Anthropic Messages API puts the system prompt in a top-level `system` field, not in `messages`.
- Do not add streaming; all hive calls are single-shot JSON.

---

## Agent Task 2: Embedding module (`lib/hive/embeddings.ts`)

**Delegate to:** sonnet
**Parallelizable:** Yes
**Depends on:** None

### Context

Arbor is an agent marketplace on Next.js 15 + Convex. The hive mind extension needs 1536-dimension vector embeddings in three places built by later tasks: the agent capability registry (semantic search over capability descriptions), the per-DAG-node router (embed the node description, cosine-match against registered agents), and the shared context store (semantic retrieval of prior reasoning). The storage and search side will use Convex vector indexes (`.vectorIndex(...)` in `convex/schema.ts`, queried with `ctx.vectorSearch` from Convex actions), which require `v.array(v.float64())` fields of a fixed dimension — this plan standardizes on 1536.

Anthropic's API has no embeddings endpoint, so embeddings cannot come from `claude-haiku-4-5-20251001`. The repo already has `OPENAI_API_KEY` configured (see `.env.example` line 2 and `.env.local`), and `eval/router-bench/embed.ts` contains a dependency-free FNV-1a hashing embedder (word tokens + character trigrams, term-frequency weighted, L2-normalized) used as an offline benchmark baseline with an explicitly documented "v2 upgrade path: swap embed() for an OpenAI embedder behind an env flag without touching callers". This task builds that production embedder: OpenAI `text-embedding-3-small` at 1536 dims as primary, the hashing embedder (re-dimensioned to 1536) as a deterministic offline fallback so dev environments and CI work with no key. The module must be importable from both Next.js routes and Convex `"use node"` actions, so it must use plain `fetch` and have no Node-only imports.

### Goal

A new module `lib/hive/embeddings.ts` exporting `embedText(text)` returning a 1536-length `number[]`, `embedTexts(texts)` for batching, and `cosineSimilarity(a, b)`, where the OpenAI embeddings API is used when `OPENAI_API_KEY` is set and a deterministic local hashing embedder (ported from `eval/router-bench/embed.ts`, re-dimensioned to 1536 and returning `number[]`) is used otherwise, with the active backend reported via an exported `embeddingBackend()` function so callers can record provenance.

### Files to Create or Modify

- `lib/hive/embeddings.ts` — create
- `lib/hive/embeddings.test.ts` — create
- `package.json` — modify (append `lib/hive/embeddings.test.ts` to the `test` script)

### Files to Leave Alone

- `eval/router-bench/embed.ts` — benchmark baseline must stay deterministic and 2048-dim; copy logic, do not import or edit.
- `convex/auctions.ts` — Vickrey auction; only Agent Task 12 may touch it.
- `lib/specialists/mcp-forwarding.ts` and `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Create `lib/hive/embeddings.ts` with `export const EMBEDDING_DIM = 1536;`.
2. Implement the local fallback: port `hashToken`, `features`, and `embed` from `eval/router-bench/embed.ts` into private functions, change `DIM` to `EMBEDDING_DIM`, and return `number[]` (plain array, not `Float64Array`) so the result is a valid Convex value.
3. Implement `async function openAIEmbed(texts: string[]): Promise<number[][]>`: POST `https://api.openai.com/v1/embeddings` with header `authorization: Bearer ${process.env.OPENAI_API_KEY}` and body `{ model: "text-embedding-3-small", input: texts, dimensions: 1536 }`; 15s timeout via `Promise.race`; throw on non-2xx with the first 300 chars of the body; map `data[i].embedding`.
4. Implement `export function embeddingBackend(): "openai" | "local-hash"` — `"openai"` iff `process.env.OPENAI_API_KEY` is set and `process.env.HIVE_EMBEDDINGS_FORCE_LOCAL !== "true"`.
5. Implement `export async function embedTexts(texts: string[]): Promise<number[][]>`: trim/truncate each input to 8000 chars; route to `openAIEmbed` or the local embedder per `embeddingBackend()`; on OpenAI failure, fall back to local and `console.warn` once with the error message.
6. Implement `export async function embedText(text: string): Promise<number[]>` as `(await embedTexts([text]))[0]`.
7. Implement `export function cosineSimilarity(a: number[], b: number[]): number` (dot product; inputs are already L2-normalized by both backends — OpenAI embeddings are unit-norm; normalize the local embedder output too).
8. Create `lib/hive/embeddings.test.ts` (tsx-runnable, same style as `lib/intake-normalize.test.ts`): with `HIVE_EMBEDDINGS_FORCE_LOCAL=true` set in the test, assert vectors are length 1536, deterministic for the same input, unit-norm (within 1e-6), and `cosineSimilarity("stripe payments", "stripe payouts") > cosineSimilarity("stripe payments", "kubernetes scheduling")`.
9. Append the test to the `package.json` `test` script chain.

### New Types and Schemas

```typescript
// lib/hive/embeddings.ts
export const EMBEDDING_DIM = 1536;
export function embeddingBackend(): "openai" | "local-hash";
export async function embedText(text: string): Promise<number[]>;
export async function embedTexts(texts: string[]): Promise<number[][]>;
export function cosineSimilarity(a: number[], b: number[]): number;
```

### Success Criteria

- `npm run typecheck` passes.
- `HIVE_EMBEDDINGS_FORCE_LOCAL=true npx tsx lib/hive/embeddings.test.ts` exits 0 with no network access.
- `node -e` is not needed; no new npm dependencies.

### Notes

- Anthropic has no embeddings API — this is the one sanctioned non-Anthropic AI call in the hive layer; record `embeddingBackend()` wherever embeddings are persisted (later tasks store it as `embedding_model`).
- Plain `number[]` is required: Convex `v.array(v.float64())` does not accept typed arrays.
- Mixing backends corrupts cosine space: later tasks re-embed (backfill) if the backend changes; that is their concern, but keep `embeddingBackend()` cheap and exact.

---

## Agent Task 3: Hive schema — new tables and additive columns (`convex/schema.ts`)

**Delegate to:** sonnet
**Parallelizable:** Yes
**Depends on:** None

### Context

Arbor's only database is Convex; the full schema lives in `convex/schema.ts` (a single `defineSchema` export). Existing tables that matter here: `agents` (live reputation mirror, one row per specialist, index `by_agent_id`), `discovered_specialists` (runtime-registered external agents, index `by_agent_id`), `tasks` (auction lifecycle rows; has `parent_task_id`/`step_index` for the current sequential multi-step planner and an unused-for-hive `task_plan` array), `bids`, `reputation_dimensions`, `lifecycle_events`, `escrow`. The hard constraint is: add columns and tables only — never drop, rename, or change the type of anything that exists, because live Convex deployments validate existing documents against the schema on push.

The hive mind needs storage for: (Layer 1) capability embeddings + structured metadata + eval-gate status per agent; (Layer 2) task DAGs with nodes and `depends_on` edges; (Layer 3) per-task invited-bidder lists so the router can scope the existing Vickrey auction to a shortlist; (Layer 4) a shared scratchpad with `agent_id`/`task_id`/timestamp/confidence stamps and a vector index for semantic recall; (Layer 5) evaluation records and human-review escalations; (Layer 6) monthly payout records per agent owner. Convex vector indexes are declared with `.vectorIndex(name, { vectorField, dimensions, filterFields })` on a table whose vector field is `v.array(v.float64())`; this plan standardizes on 1536 dimensions (see `lib/hive/embeddings.ts` from Agent Task 2 — but this task does not import it; the schema is self-contained).

### Goal

`convex/schema.ts` gains six new tables (`hive_agent_embeddings`, `hive_dags`, `hive_nodes`, `scratchpad_entries`, `hive_evaluations`, `payout_records`, `escalations` — seven counting escalations) and additive optional columns on `tasks` and `discovered_specialists`, all with indexes and vector indexes exactly as specified below, pushed cleanly to a dev deployment with `npx convex dev --once` without any data migration.

### Files to Create or Modify

- `convex/schema.ts` — modify (append new tables; add optional columns to `tasks` and `discovered_specialists`)

### Files to Leave Alone

- `convex/auctions.ts` — Vickrey auction; only Agent Task 12 may touch it.
- `lib/specialists/mcp-forwarding.ts` and `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- `convex/_generated/**` — regenerated automatically; never hand-edit.
- All existing table definitions' existing fields — additive changes only.

### Implementation Steps

1. In the `tasks` table definition, append these optional fields after `task_plan`: `invited_agent_ids: v.optional(v.array(v.string()))`, `hive_dag_id: v.optional(v.id("hive_dags"))`, `hive_node_id: v.optional(v.string())`, `success_criteria: v.optional(v.string())`.
2. In the `discovered_specialists` table definition, append: `owner_id: v.optional(v.string())`, `mcp_tool_schemas: v.optional(v.array(v.any()))`, `avg_latency_ms: v.optional(v.number())`, `reliability_score: v.optional(v.number())`, `eval_status: v.optional(v.union(v.literal("pending"), v.literal("passed"), v.literal("failed")))`, `eval_report: v.optional(v.any())`.
3. Append the new tables exactly as written in "New Types and Schemas" below.
4. Run `npx convex dev --once` (requires `CONVEX_DEPLOYMENT` from `.env.local`); confirm the push succeeds and `convex/_generated/api.d.ts` regenerates.

### New Types and Schemas

Append to `defineSchema({...})` in `convex/schema.ts`:

```typescript
  // ─── Hive mind: Layer 1 registry embeddings ──────────────────────────────
  hive_agent_embeddings: defineTable({
    agent_id: v.string(),
    capability_text: v.string(),
    embedding: v.array(v.float64()),
    embedding_model: v.string(),          // "openai:text-embedding-3-small" | "local-hash"
    eval_passed: v.boolean(),             // mirror of eval gate; vector filter field
    cost_baseline: v.number(),
    reputation_score: v.number(),         // denormalized at write time for cheap post-filtering
    updated_at: v.number(),
  })
    .index("by_agent_id", ["agent_id"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["eval_passed"],
    }),

  // ─── Hive mind: Layer 2 task DAGs ────────────────────────────────────────
  hive_dags: defineTable({
    root_task_id: v.id("tasks"),
    goal: v.string(),
    status: v.union(
      v.literal("planning"),
      v.literal("running"),
      v.literal("evaluating"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("escalated"),
    ),
    planner_model: v.string(),
    max_budget: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_root_task", ["root_task_id"]),

  hive_nodes: defineTable({
    dag_id: v.id("hive_dags"),
    node_id: v.string(),                  // planner-assigned id, unique within dag
    description: v.string(),
    depends_on: v.array(v.string()),      // node_ids
    success_criteria: v.optional(v.string()),
    task_class: v.optional(v.string()),   // "reasoning" | "classification" | "extraction" | "generation"
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("auctioned"),
      v.literal("executing"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    task_id: v.optional(v.id("tasks")),   // the auction child task once routed
    assigned_agent_id: v.optional(v.string()),
    output_text: v.optional(v.string()),
    eval_score: v.optional(v.number()),
    updated_at: v.number(),
  })
    .index("by_dag", ["dag_id"])
    .index("by_dag_and_node_id", ["dag_id", "node_id"])
    .index("by_task_id", ["task_id"]),

  // ─── Hive mind: Layer 4 shared context store (stigmergy scratchpad) ─────
  scratchpad_entries: defineTable({
    dag_id: v.id("hive_dags"),
    node_id: v.optional(v.string()),
    task_id: v.optional(v.id("tasks")),
    agent_id: v.string(),
    kind: v.union(
      v.literal("observation"),
      v.literal("result"),
      v.literal("decision"),
      v.literal("question"),
    ),
    content: v.string(),
    confidence: v.number(),               // 0..1 float, stamped by the writer
    embedding: v.optional(v.array(v.float64())),
    embedding_model: v.optional(v.string()),
    created_at: v.number(),
  })
    .index("by_dag", ["dag_id"])
    .index("by_dag_and_node", ["dag_id", "node_id"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["dag_id"],
    }),

  // ─── Hive mind: Layer 5 evaluations + escalations ────────────────────────
  hive_evaluations: defineTable({
    dag_id: v.id("hive_dags"),
    node_id: v.optional(v.string()),      // null = whole-DAG synthesis evaluation
    agent_id: v.string(),
    score: v.number(),                    // 0..1
    verdict: v.union(v.literal("accept"), v.literal("reject")),
    reasoning: v.string(),
    conflicts_with: v.optional(v.array(v.string())),  // node_ids judged in conflict
    judge_model: v.string(),
    created_at: v.number(),
  }).index("by_dag", ["dag_id"]),

  escalations: defineTable({
    dag_id: v.optional(v.id("hive_dags")),
    task_id: v.id("tasks"),
    kind: v.union(v.literal("low_confidence"), v.literal("conflict_tie")),
    reason: v.string(),
    payload: v.optional(v.any()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    resolution: v.optional(v.string()),
    created_at: v.number(),
    resolved_at: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_task", ["task_id"]),

  // ─── Hive mind: Layer 6 settlement ───────────────────────────────────────
  payout_records: defineTable({
    owner_id: v.string(),                 // agent owner; falls back to sponsor name
    agent_id: v.string(),
    period: v.string(),                   // "YYYY-MM"
    tasks_won: v.number(),
    tasks_lost: v.number(),
    tasks_accepted: v.number(),
    gross_volume: v.number(),             // sum of price_paid on accepted tasks
    platform_fee: v.number(),
    estimated_payout: v.number(),         // gross_volume - platform_fee
    reputation_end: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_owner_and_period", ["owner_id", "period"])
    .index("by_agent_and_period", ["agent_id", "period"]),
```

### Success Criteria

- `npx convex dev --once` pushes without schema validation errors against the existing dev deployment data.
- `grep -c "vectorIndex" convex/schema.ts` returns 2.
- No existing field in `convex/schema.ts` was removed or had its validator changed (verify with `git diff convex/schema.ts` — all hunks are pure additions).

### Notes

- Convex requires `filterFields` values to be top-level document fields; that is why `eval_passed`, `cost_baseline`, and `reputation_score` are denormalized onto `hive_agent_embeddings` (the registry write path in Agent Task 4 keeps them fresh).
- `scratchpad_entries.embedding` is optional so cheap writes can land instantly and be embedded asynchronously; the vector index simply skips documents missing the field.
- Do not add a vector index to `hive_nodes`; node routing embeds on the fly (Agent Task 11).
- Per repo CLAUDE.md, read `convex/_generated/ai/guidelines.md` before editing any Convex file.

---

## Agent Task 4: Registry backend (`convex/hiveRegistry.ts` + `lib/hive/registry-core.ts`)

**Delegate to:** fable
**Parallelizable:** No
**Depends on:** Agent Task 1 (Anthropic layer), Agent Task 2 (embeddings), Agent Task 3 (hive schema)

### Context

Arbor stores external agents in two Convex tables defined in `convex/schema.ts`: `discovered_specialists` (capability metadata, endpoints: `mcp_endpoint`, `a2a_endpoint`, key env conventions, `discovery_source`) and a mirrored `agents` row carrying live `reputation_score`. Registration today happens through `convex/discoveredSpecialists.ts` — `create` (throws on duplicate `agent_id`, inserts the mirror) and `upsert` (idempotent, patches the mirror) — driven by `handleDiscoverSpecialist` in `lib/mcp-tools.ts`. The runner factory `buildRunner(cfg)` in `lib/specialists/registry.ts` turns a `SpecialistConfig` (type in `lib/types.ts`) into a bid/execute/probe runner based on `cfg.tier`; configs with `a2a_endpoint` get tier `"a2a"`, with `mcp_endpoint` get `"mcp-forwarding"`, else `"mock"`.

Agent Task 3 added the `hive_agent_embeddings` table: `{ agent_id, capability_text, embedding (1536 float64s, vector index "by_embedding" with filterFields ["eval_passed"]), embedding_model, eval_passed, cost_baseline, reputation_score, updated_at }`, index `by_agent_id`. Agent Task 2 created `lib/hive/embeddings.ts` (`embedText`, `embedTexts`, `embeddingBackend`, `EMBEDDING_DIM = 1536`). Agent Task 3 also added optional columns to `discovered_specialists`: `owner_id`, `mcp_tool_schemas`, `avg_latency_ms`, `reliability_score`, `eval_status`, `eval_report`. This task builds the Layer 1 hive registry on top: agents publish capability schemas as MCP tool definitions, the registry indexes them with embeddings for semantic search and structured metadata for filtering. Convex rule: `ctx.vectorSearch` only works inside actions; `ctx.db` is unavailable in actions, so document fetches after a vector search go through an `internalQuery`.

### Goal

A registration-and-search backend: `convex/hiveRegistry.ts` exposes a public `register` mutation-equivalent flow (action `registerAgent` that validates, upserts `discovered_specialists` via the existing `upsert` mutation, optionally fetches MCP tool schemas, and writes/refreshes the `hive_agent_embeddings` row marked `eval_passed: false` pending the Agent Task 5 gate) plus a `searchAgents` action that embeds a query, runs `ctx.vectorSearch` over `hive_agent_embeddings` filtered to `eval_passed: true`, post-filters by reputation and cost thresholds, and returns hydrated candidate records; shared text-assembly helpers live in `lib/hive/registry-core.ts`.

### Files to Create or Modify

- `lib/hive/registry-core.ts` — create (pure helpers: capability text assembly, candidate shaping; no Convex imports)
- `convex/hiveRegistry.ts` — create (`"use node"` actions: `registerAgent`, `searchAgents`, `refreshEmbedding`)
- `convex/hiveRegistryData.ts` — create (default-runtime `internalQuery`/`internalMutation` helpers used by the actions; no `"use node"`)

### Files to Leave Alone

- `convex/discoveredSpecialists.ts` — reuse its `upsert` mutation as-is; do not modify (it already mirrors into `agents`).
- `convex/auctions.ts` — Vickrey auction; only Agent Task 12 may touch it.
- `lib/specialists/mcp-forwarding.ts` and `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- `lib/specialists/registry.ts` — the runner factory keeps working off `discovered_specialists` rows; no changes needed.

### Implementation Steps

1. Create `lib/hive/registry-core.ts` with `buildCapabilityText(input: { display_name: string; sponsor: string; one_liner: string; capabilities: string[]; mcp_tool_schemas?: Array<{ name?: string; description?: string }>; })` returning a single string: display name, sponsor, one-liner, capability list, then up to 20 tool `name: description` lines (each description truncated to 200 chars). This is the text that gets embedded — deterministic field order so re-embeds are stable.
2. In the same file define and export the wire types `HiveAgentRegistration` and `HiveAgentCandidate` (full definitions below).
3. Create `convex/hiveRegistryData.ts` (NO `"use node"`) with: `_getEmbeddingByAgentId` (internalQuery, args `{ agent_id: v.string() }`, `withIndex("by_agent_id")`, `.unique()` semantics via `.first()`); `_upsertEmbedding` (internalMutation, args matching the full `hive_agent_embeddings` row minus `_id`; patch when an existing row is found by `by_agent_id`, insert otherwise); `_hydrateCandidates` (internalQuery, args `{ agent_ids: v.array(v.string()) }`, returns for each id the joined `discovered_specialists` row (by `by_agent_id`) and `agents` row (reputation), skipping ids with no specialist row); `_setEvalPassed` (internalMutation, args `{ agent_id: v.string(), eval_passed: v.boolean() }`, patches the embeddings row — Agent Task 5 calls this).
4. Create `convex/hiveRegistry.ts` with `"use node"` at top (it imports `lib/hive/embeddings.ts` and `lib/mcp-outbound.ts`).
5. Implement `registerAgent` as a public `action` with validated args mirroring `HiveAgentRegistration` (use `v.object` field validators inline). Steps inside: (a) validate `agent_id` against the regex `/^[a-z0-9][a-z0-9-]{2,40}$/` (same rule as `convex/discoveredSpecialists.ts` line 4); (b) call `ctx.runMutation(api.discoveredSpecialists.upsert, {...})` mapping fields 1:1 and passing the new optional columns (`owner_id`, `eval_status: "pending"`); (c) if `mcp_endpoint` is present and `fetch_tools !== false`, call `discoverTools(mcp_endpoint)` from `lib/mcp-outbound.ts` inside a try/catch (8s budget is built into `discoverTools`), persist the tool list via a second `upsert` call setting `mcp_tool_schemas`; (d) build capability text with `buildCapabilityText`, call `embedText`, and `ctx.runMutation(internal.hiveRegistryData._upsertEmbedding, { agent_id, capability_text, embedding, embedding_model: embeddingBackend() === "openai" ? "openai:text-embedding-3-small" : "local-hash", eval_passed: false, cost_baseline, reputation_score: starting_reputation, updated_at: Date.now() })`; (e) schedule the eval gate when it exists: `await ctx.scheduler.runAfter(0, internal.hiveEvalGate.runEvalGate, { agent_id })` — wrap in try/catch with a console.warn so this task is testable before Agent Task 5 lands, and leave a `// Agent Task 5 wires internal.hiveEvalGate.runEvalGate` comment; (f) return `{ agent_id, registered: true, eval_status: "pending", embedding_model }`.
6. Implement `searchAgents` as a public `action` with args `{ query: v.string(), top_k: v.optional(v.number()), min_reputation: v.optional(v.number()), max_cost: v.optional(v.number()), include_unevaluated: v.optional(v.boolean()) }`. Steps: embed the query; `const hits = await ctx.vectorSearch("hive_agent_embeddings", "by_embedding", { vector, limit: Math.min(64, (top_k ?? 8) * 4), filter: include_unevaluated ? undefined : (q) => q.eq("eval_passed", true) })`; fetch the embedding rows for hit ids via a small internalQuery `_getEmbeddingsByIds` (add it to `convex/hiveRegistryData.ts`: args `{ ids: v.array(v.id("hive_agent_embeddings")) }`, `ctx.db.get` each); apply `min_reputation` (default 0.3) and `max_cost` (default Infinity) against the denormalized fields; hydrate the top `top_k ?? 8` via `_hydrateCandidates`; return `HiveAgentCandidate[]` including each hit's `_score` as `similarity`.
7. Implement `refreshEmbedding` as an `internalAction` with args `{ agent_id: v.string() }`: re-read the specialist row (`internal.discoveredSpecialists._getByAgentId` already exists in `convex/discoveredSpecialists.ts`), rebuild capability text, re-embed, `_upsertEmbedding` preserving the current `eval_passed` (read it first via `_getEmbeddingByAgentId`) and refreshing `reputation_score` from the `agents` row (`internal.agents._getByAgentId` in `convex/agents.ts`). Agent Task 8 (backfill) and Agent Task 15 (post-evaluation reputation refresh) call this.
8. Run `npx convex dev --once` to push and typecheck.

### New Types and Schemas

```typescript
// lib/hive/registry-core.ts
export interface HiveAgentRegistration {
  agent_id: string;            // kebab-case, 3-40 chars
  display_name: string;
  sponsor: string;
  owner_id?: string;           // payout attribution; defaults to sponsor
  capabilities: string[];
  one_liner: string;
  system_prompt: string;
  cost_baseline: number;
  starting_reputation?: number; // default 0.5
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  homepage_url?: string;
  fetch_tools?: boolean;       // default true when mcp_endpoint set
}

export interface HiveAgentCandidate {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  cost_baseline: number;
  reputation_score: number;
  similarity: number;          // cosine score from ctx.vectorSearch
  eval_status: "pending" | "passed" | "failed";
  transport: "a2a" | "mcp" | "none";
  mcp_endpoint?: string;
  a2a_endpoint?: string;
}

export function buildCapabilityText(input: {
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  mcp_tool_schemas?: Array<{ name?: string; description?: string }>;
}): string;
```

API contract (consumed by Agent Tasks 6, 7, 11):
- `api.hiveRegistry.registerAgent` (action) — args = `HiveAgentRegistration` fields as validators; returns `{ agent_id, registered: boolean, eval_status, embedding_model }`.
- `api.hiveRegistry.searchAgents` (action) — args `{ query, top_k?, min_reputation?, max_cost?, include_unevaluated? }`; returns `HiveAgentCandidate[]`.
- `internal.hiveRegistry.refreshEmbedding` (internalAction) — args `{ agent_id }`.
- `internal.hiveRegistryData._setEvalPassed` (internalMutation) — args `{ agent_id, eval_passed }`.

### Success Criteria

- `npx convex dev --once` pushes cleanly.
- From the repo root with the dev deployment running: `npx convex run hiveRegistry:registerAgent '{"agent_id":"smoke-hive-agent","display_name":"Smoke Hive Agent","sponsor":"Smoke","capabilities":["unit testing"],"one_liner":"Test agent for hive registry","system_prompt":"You are a test agent.","cost_baseline":0.2}'` returns `{ registered: true, eval_status: "pending" }`.
- `npx convex run hiveRegistry:searchAgents '{"query":"unit testing","include_unevaluated":true}'` returns an array containing `smoke-hive-agent` with a numeric `similarity`.
- `npm run typecheck` passes (lib/ helpers only; convex/ is checked by the push).

### Notes

- `ctx.vectorSearch` returns `{ _id, _score }` only; hydration must go through queries — that is why `convex/hiveRegistryData.ts` exists as a separate non-node file (a `"use node"` file may not export queries/mutations).
- Reputation and cost on `hive_agent_embeddings` are denormalized snapshots used only for pre-filtering; authoritative reputation stays on `agents.reputation_score`. `refreshEmbedding` is the resync path.
- Do not gate `registerAgent` on auth in this task; transport-level auth (HMAC/keys) is an existing concern handled at the route layer (Agent Task 6 notes it).


---

## Agent Task 5: Registration eval gate (`convex/hiveEvalGate.ts`)

**Delegate to:** opus
**Parallelizable:** No
**Depends on:** Agent Task 4 (registry backend)

### Context

Arbor is an agent marketplace where external agents execute tasks over MCP (`makeMcpForwardingSpecialist` in `lib/specialists/mcp-forwarding.ts`) or A2A (`makeA2aForwardingSpecialist` in `lib/specialists/a2a-forwarding.ts`); both runners expose `probe(taskType)` returning `{ status: "pass" | "fail" | "demo_lane", duration_ms, response_excerpt?, error_message? }`. The runner for any registered agent is obtained with `getRunner(agent_id)` from `lib/specialists/registry.ts`, after first calling `registerDiscoveredSpecialist(cfg)` to hydrate the per-process cache from a `discovered_specialists` row — the exact pattern used by `convex/auctions.ts` `execute` (lines ~802-831: read row via `internal.discoveredSpecialists._getByAgentId`, map to `SpecialistConfig` with `tier: a2a_endpoint ? "a2a" : mcp_endpoint ? "mcp-forwarding" : "mock"`, register, then `getRunner`).

Agent Task 4 created `convex/hiveRegistry.ts` whose `registerAgent` action schedules `internal.hiveEvalGate.runEvalGate({ agent_id })` after writing a `hive_agent_embeddings` row with `eval_passed: false`, and `convex/hiveRegistryData.ts` with `internal.hiveRegistryData._setEvalPassed({ agent_id, eval_passed })`. Agent Task 3 added `eval_status` (`"pending" | "passed" | "failed"`) and `eval_report` columns to `discovered_specialists`. Agent Task 1 created `lib/anthropic.ts` (`callClaudeJSON`, `CLAUDE_FAST_MODEL = "claude-haiku-4-5-20251001"`). The hive rule: registration requires a fixed eval pass before an agent enters the routing pool — `searchAgents` filters on `eval_passed: true`, so an agent that never passes is simply invisible to the hive router while remaining a normal marketplace specialist (the legacy open auction is unaffected by design).

### Goal

An internal action `runEvalGate` that, given an `agent_id`, loads the specialist config, runs a two-stage fixed eval — (1) liveness: the runner's `probe("general")` must return `"pass"`; (2) competence: send a fixed canned bid request through the runner's `bid(prompt, taskType)` and have `claude-haiku-4-5-20251001` grade whether the response is a coherent, on-topic plan or decline — then writes `eval_status`/`eval_report` to `discovered_specialists`, flips `hive_agent_embeddings.eval_passed` via `_setEvalPassed`, and logs the outcome, with agents lacking any live endpoint (`tier "mock"`) always failing the gate.

### Files to Create or Modify

- `convex/hiveEvalGate.ts` — create (`"use node"`)
- `convex/hiveRegistryData.ts` — modify (add `_setEvalResult` internalMutation that patches `discovered_specialists.eval_status` + `eval_report` by `by_agent_id`)
- `convex/hiveRegistry.ts` — modify (remove the try/catch placeholder around the scheduler call; keep the call `ctx.scheduler.runAfter(0, internal.hiveEvalGate.runEvalGate, { agent_id })`)

### Files to Leave Alone

- `convex/auctions.ts` — Vickrey auction; only Agent Task 12 may touch it.
- `lib/specialists/mcp-forwarding.ts` and `lib/specialists/a2a-forwarding.ts` — the gate calls their public runner interface only.
- `lib/specialists/registry.ts` — use `registerDiscoveredSpecialist` + `getRunner` as-is.

### Implementation Steps

1. Create `convex/hiveEvalGate.ts` with `"use node"`. Define the fixed eval task constant: `const EVAL_PROMPT = "Summarize the three most important considerations when integrating a third-party payments API into an existing web application, and state which one you would verify first.";` and `const EVAL_TASK_TYPE = "general";`. Fixed means fixed — do not randomize.
2. Implement `export const runEvalGate = internalAction({ args: { agent_id: v.string() }, handler })`.
3. Inside the handler: read the specialist row with `ctx.runQuery(internal.discoveredSpecialists._getByAgentId, { agent_id })`; if absent, write a failed report `{ stage: "load", error: "no discovered_specialists row" }` and return.
4. Map the row to a `SpecialistConfig` exactly as `convex/auctions.ts` does (same field mapping, same tier derivation), call `registerDiscoveredSpecialist(cfg)`, then `getRunner(agent_id)`.
5. Stage 1 — liveness: if `cfg.tier === "mock"` or `!runner.probe`, fail with reason `"no live endpoint"`. Otherwise run `runner.probe(EVAL_TASK_TYPE)` with a 15s `Promise.race` timeout; require `status === "pass"`.
6. Stage 2 — competence: run `runner.bid(EVAL_PROMPT, EVAL_TASK_TYPE)` with a 20s timeout. A `DeclineDecision` (`{ decline: true }`) fails the gate with reason `"declined fixed eval"`. For a `BidPayload`, grade `capability_claim` with `callClaudeJSON<{ pass: boolean; reason: string }>` using `CLAUDE_FAST_MODEL`, system prompt: grader instructions requiring the plan to (a) address payments-API integration specifically, (b) contain at least two concrete steps, (c) not be a generic capability pitch; user prompt: the eval prompt plus the claim. Fail-closed on grader errors? No — fail-OPEN on grader transport errors (record `grader_error`, treat stage 2 as passed) because the liveness probe already gates reachability and a model outage must not block registrations; record the choice in the report.
7. Assemble `eval_report = { stages: { probe: {...}, bid: {...}, grade: {...} }, passed, completed_at }`; write it with `ctx.runMutation(internal.hiveRegistryData._setEvalResult, { agent_id, eval_status: passed ? "passed" : "failed", eval_report })`; flip the vector filter with `ctx.runMutation(internal.hiveRegistryData._setEvalPassed, { agent_id, eval_passed: passed })`.
8. `console.log` a single structured line `[hive-eval-gate] agent=<id> passed=<bool> reason=<...>` for operability.
9. Add `_setEvalResult` to `convex/hiveRegistryData.ts` (args `{ agent_id: v.string(), eval_status: v.union(v.literal("passed"), v.literal("failed"), v.literal("pending")), eval_report: v.any() }`).
10. Push with `npx convex dev --once`.

### New Types and Schemas

```typescript
// shape persisted into discovered_specialists.eval_report (v.any() column)
interface EvalReport {
  stages: {
    probe: { status: "pass" | "fail" | "demo_lane" | "skipped"; duration_ms?: number; error?: string };
    bid: { kind: "bid" | "decline" | "error"; capability_claim?: string; error?: string };
    grade: { pass?: boolean; reason?: string; grader_error?: string };
  };
  passed: boolean;
  completed_at: number;
}
```

API contract: `internal.hiveEvalGate.runEvalGate` (internalAction), args `{ agent_id: string }`, returns null.

### Success Criteria

- `npx convex dev --once` pushes cleanly.
- `npx convex run hiveRegistry:registerAgent '{...smoke agent from Task 4, no endpoints...}'` followed (after ~5s) by inspecting the row shows `eval_status: "failed"` with reason `"no live endpoint"` — mock agents never enter the pool.
- Registering a specialist whose `a2a_endpoint` points at the running loopback gateway (`http://localhost:3000/api/a2a/market`, card URL same) results in `eval_status: "passed"` and `searchAgents` (without `include_unevaluated`) now returning it.
- `npx convex run hiveEvalGate:runEvalGate '{"agent_id":"nonexistent"}'` does not throw (writes a load-failure report path is skipped since there is no row; it must return cleanly).

### Notes

- The gate runs server-side in Convex node actions; remote endpoints must be reachable from Convex cloud — localhost agents need a tunnel (this repo already uses cloudflared tunnels for exactly this; see memory note "Convex cloud can't reach localhost").
- Grader is haiku, not fable: this is a classification task per the model-routing rule.
- Never auto-retry the gate in a loop; re-registration (idempotent `registerAgent`) is the retry path.

---

## Agent Task 6: Registry REST endpoints (`/api/v1/agents/*`)

**Delegate to:** sonnet
**Parallelizable:** No
**Depends on:** Agent Task 4 (registry backend); Agent Task 5 only at runtime (gate fires automatically)

### Context

Arbor exposes a REST surface under `app/api/v1/` as thin wrappers over handler functions: see `app/api/v1/tasks/route.ts` (validates body, calls `handlePostTask` from `lib/mcp-tools.ts`, responds with `jsonOk`/`jsonError` from `lib/http.ts`, exports `OPTIONS` returning `corsPreflight()`, sets `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`). Convex public functions are called from Next routes through `ConvexHttpClient` — `lib/mcp-tools.ts` line 27 has the canonical `convex()` helper reading `NEXT_PUBLIC_CONVEX_URL`. Actions are invoked with `client.action(api.module.fn, args)` (see `handleRaiseDispute` in `lib/mcp-tools.ts` for the pattern).

Agent Task 4 created two public Convex actions: `api.hiveRegistry.registerAgent` (args: the `HiveAgentRegistration` fields — agent_id, display_name, sponsor, owner_id?, capabilities, one_liner, system_prompt, cost_baseline, starting_reputation?, mcp_endpoint?, mcp_api_key_env?, a2a_endpoint?, a2a_agent_card_url?, a2a_api_key_env?, homepage_url?, fetch_tools?) and `api.hiveRegistry.searchAgents` (args: query, top_k?, min_reputation?, max_cost?, include_unevaluated?). The wire types live in `lib/hive/registry-core.ts`. The root index route `app/api/v1/route.ts` lists available endpoints in its GET response and should advertise the new ones. This task gives external agents a plain-HTTP path to self-register into the hive (any agent, not just Arbor's own) and to query the registry semantically.

### Goal

Two new REST endpoints following the exact conventions of the existing v1 routes: `POST /api/v1/agents/register` validating the registration body and proxying to `api.hiveRegistry.registerAgent`, and `GET /api/v1/agents/search?q=...&top_k=...&min_reputation=...&max_cost=...` proxying to `api.hiveRegistry.searchAgents`, both CORS-enabled, plus the v1 index updated to advertise them.

### Files to Create or Modify

- `app/api/v1/agents/register/route.ts` — create
- `app/api/v1/agents/search/route.ts` — create
- `app/api/v1/route.ts` — modify (add the two endpoints to the `endpoints` object in the GET payload)

### Files to Leave Alone

- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- `lib/mcp-tools.ts` — MCP tool exposure is Agent Task 7's job; keep this task route-only.
- `app/api/openapi.json/route.ts` — optional polish, out of scope.

### Implementation Steps

1. Create `app/api/v1/agents/register/route.ts` mirroring `app/api/v1/tasks/route.ts` structure: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `POST` parses JSON (400 on invalid), validates `agent_id` (string matching `/^[a-z0-9][a-z0-9-]{2,40}$/`), `display_name`, `sponsor`, `one_liner`, `system_prompt` (non-empty strings), `capabilities` (non-empty string array), `cost_baseline` (number > 0); 400 with a field-specific message on each failure.
2. Build a local `convex()` helper identical to the one in `lib/mcp-tools.ts` (or import `ConvexHttpClient` and read `NEXT_PUBLIC_CONVEX_URL`); call `client.action(api.hiveRegistry.registerAgent, body)` passing only the whitelisted fields (never spread unknown keys); respond `jsonOk(result, 201)`.
3. Map Convex errors to 409 when the message contains `"collides with a sponsor"`, otherwise 500 via `jsonError`.
4. Create `app/api/v1/agents/search/route.ts`: `GET` reads `q` (required, 400 if missing/empty), `top_k`, `min_reputation`, `max_cost` (optional, `Number(...)` with `Number.isFinite` guards), `include_unevaluated` (`"true"` only); calls `client.action(api.hiveRegistry.searchAgents, { query: q, ... })`; responds `jsonOk({ query: q, candidates: result })`.
5. Both files export `OPTIONS` returning `corsPreflight()`.
6. Update `app/api/v1/route.ts` GET payload `endpoints` object with: `"POST /api/v1/agents/register": "Register an external agent into the hive registry (capability schema + endpoints). Triggers the eval gate."` and `"GET /api/v1/agents/search?q=": "Semantic search over registered agents by capability."`.

### New Types and Schemas

No new types — request body is `HiveAgentRegistration` from `lib/hive/registry-core.ts` (import it for typing the parsed body), response is the action's return value passed through.

### Success Criteria

- `npm run typecheck` passes.
- With `npm run dev` and Convex dev running: `curl -s -X POST localhost:3000/api/v1/agents/register -H 'content-type: application/json' -d '{"agent_id":"curl-test-agent","display_name":"Curl Test","sponsor":"Curl","capabilities":["testing"],"one_liner":"test","system_prompt":"You are a test.","cost_baseline":0.1}'` returns 201 with `{"agent_id":"curl-test-agent","registered":true,...}`.
- `curl -s 'localhost:3000/api/v1/agents/search?q=testing&include_unevaluated=true'` returns the agent with a `similarity` field.
- `curl -s localhost:3000/api/v1` lists both new endpoints.

### Notes

- No auth in v1, consistent with every other v1 route ("No auth in v0" per `lib/mcp-tools.ts` post_task description). If `ARBOR_A2A_HMAC_REQUIRED`-style signing is wanted later, it belongs at this route layer, not in `hiveRegistry`.
- Registration is idempotent (upsert underneath) — document in the route's error mapping that re-POSTing the same agent_id updates it and re-runs the eval gate.

---

## Agent Task 7: MCP tools for the hive registry (`register_agent`, `search_agents`)

**Delegate to:** sonnet
**Parallelizable:** No
**Depends on:** Agent Task 4 (registry backend)

### Context

Arbor serves its own MCP server at `app/api/mcp/route.ts`; the tool definitions and handlers live in `lib/mcp-tools.ts`: a `TOOLS: ToolDefinition[]` array (each `{ name, description, inputSchema }` JSON-schema objects) and a `dispatchTool(name, args)` switch that routes to `handlePostTask`, `handleGetTask`, `handleListSpecialists`, `handleSuggestSpecialists`, `handleDiscoverSpecialist`, `handleRaiseDispute`, `handleOverrideJudge`, `handleUpsertProductContext`. The same `dispatchTool` also backs the A2A market gateway (`app/api/a2a/market/route.ts` maps `metadata.intent` to tool names via `INTENT_TO_TOOL` in `lib/specialists/a2a-market-card.ts`) and the REST routes. Convex is reached through the `convex()` helper (line 27) returning a `ConvexHttpClient`; actions are invoked as `convex().action(api.module.fn, args)`.

Agent Task 4 created `api.hiveRegistry.registerAgent` and `api.hiveRegistry.searchAgents` (arg shapes documented in that task and typed in `lib/hive/registry-core.ts` as `HiveAgentRegistration` / `HiveAgentCandidate`). External agents speak MCP first — exposing registration and semantic search as MCP tools means any MCP-capable agent can join the hive and find collaborators without bespoke HTTP code. This task only touches `lib/mcp-tools.ts`; the route file `app/api/mcp/route.ts` reads `TOOLS` and `dispatchTool` dynamically and needs no changes.

### Goal

Two new MCP tools wired end-to-end in `lib/mcp-tools.ts`: `register_agent` (full registration schema, proxies to `api.hiveRegistry.registerAgent`, returns the registration result plus a human note that the eval gate runs asynchronously) and `search_agents` (query + optional top_k / min_reputation / max_cost / include_unevaluated, proxies to `api.hiveRegistry.searchAgents`), both added to `TOOLS` and `dispatchTool`.

### Files to Create or Modify

- `lib/mcp-tools.ts` — modify (add two `ToolDefinition` entries, two arg interfaces, two handlers, two `dispatchTool` cases)

### Files to Leave Alone

- `app/api/mcp/route.ts` — generic over `TOOLS`/`dispatchTool`; no edit needed.
- `lib/specialists/a2a-market-card.ts` — adding hive intents to the A2A gateway is deliberately out of scope (keep the market card stable for existing A2A clients).
- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Add `export interface RegisterAgentArgs` and `export interface SearchAgentsArgs` (below) next to the other arg interfaces.
2. Append a `register_agent` entry to `TOOLS`: description "Register an external agent into the Arbor hive registry. Publish your capability schema (and optional MCP/A2A endpoints); a fixed eval gate runs before the agent enters the hive routing pool. Idempotent per agent_id."; `inputSchema.required = ["agent_id", "display_name", "sponsor", "capabilities", "one_liner", "system_prompt", "cost_baseline"]`; properties matching `HiveAgentRegistration` with one-line descriptions each (note on `mcp_api_key_env`/`a2a_api_key_env`: env var NAME, never a secret value).
3. Append a `search_agents` entry: description "Semantic search over hive-registered agents by capability. Returns top-K candidates by embedding similarity, filtered by reputation and cost. Only eval-passed agents are returned unless include_unevaluated is true."; required `["query"]`.
4. Implement `handleRegisterAgent(args)`: validate required fields (throw `Error` with field names — the MCP route converts thrown errors to tool errors); call `convex().action(api.hiveRegistry.registerAgent, {...whitelisted fields})`; return `{ ...result, note: "Eval gate runs asynchronously; poll search_agents or GET /api/v1/agents/search until eval_status is passed." }`.
5. Implement `handleSearchAgents(args)`: validate `query`; clamp `top_k` to 1..20; call `convex().action(api.hiveRegistry.searchAgents, ...)`; return `{ query, candidates }`.
6. Add both cases to `dispatchTool`.

### New Types and Schemas

```typescript
// lib/mcp-tools.ts
export interface RegisterAgentArgs {
  agent_id: string;
  display_name: string;
  sponsor: string;
  owner_id?: string;
  capabilities: string[];
  one_liner: string;
  system_prompt: string;
  cost_baseline: number;
  starting_reputation?: number;
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  homepage_url?: string;
  fetch_tools?: boolean;
}

export interface SearchAgentsArgs {
  query: string;
  top_k?: number;
  min_reputation?: number;
  max_cost?: number;
  include_unevaluated?: boolean;
}
```

### Success Criteria

- `npm run typecheck` passes.
- With dev servers running, an MCP `tools/list` against `http://localhost:3000/api/mcp` (e.g. via `npx tsx examples/mcp-client.ts` or raw curl JSON-RPC `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`) includes `register_agent` and `search_agents`.
- A `tools/call` of `register_agent` with the smoke payload from Agent Task 6 returns a content block containing `"registered": true`.

### Notes

- Do NOT log or echo back api key env VALUES anywhere; the schema only carries env var names by repo convention (`mcp_api_key_env` pattern in `lib/types.ts`).
- The A2A market card intent map is intentionally unchanged; A2A clients can still register via REST.

---

## Agent Task 8: Roster embedding backfill (`scripts/hive-backfill-embeddings.ts`)

**Delegate to:** qwen
**Parallelizable:** No
**Depends on:** Agent Task 4 (registry backend)

### Context

Arbor's routable agents come from three sources assembled in `convex/auctions.ts` `solicitBids`: the static sponsor roster `SPECIALISTS` (array of `SpecialistConfig` in `lib/specialists/registry.ts` — reacher-social, nia-context, hyperspell-brain, tensorlake-exec, devin-engineer, vercel-v0, insforge-backend, arbor-loopback-a2a, plus env-gated A2A configs), the curated `MCP_CATALOG` (`lib/specialists/catalog.ts`, entries with `agent_id`, `display_name`, `sponsor`, `capabilities`, `one_liner`, `cost_baseline`, `mcp_endpoint`, `domain_tags`), and runtime rows in the Convex `discovered_specialists` table (listed by the public query `api.discoveredSpecialists.list`). Agent Task 4 built `convex/hiveRegistry.ts` with the public action `api.hiveRegistry.registerAgent` (idempotent upsert + embedding write + eval-gate scheduling) — but only newly registering agents flow through it. For the hive router (Agent Task 11) to find the existing roster via vector search over `hive_agent_embeddings`, every existing agent needs an embeddings row.

The repo runs one-off TypeScript scripts with `tsx` (see `scripts/provision-agent-key.ts`, `scripts/model-smoke.ts` and the `package.json` script entries). Scripts reach Convex with `ConvexHttpClient` from `convex/browser` using `process.env.NEXT_PUBLIC_CONVEX_URL` — load `.env.local` by importing `dotenv`-free pattern: existing scripts read env directly because `tsx` is invoked through npm with the shell env; this script should read `NEXT_PUBLIC_CONVEX_URL` from `.env.local` manually if unset (parse the file, no new deps).

### Goal

A CLI script `scripts/hive-backfill-embeddings.ts` (run as `npm run hive:backfill`) that enumerates the static `SPECIALISTS` roster, the `MCP_CATALOG`, and all `discovered_specialists` rows, and for each one calls `api.hiveRegistry.registerAgent` with `fetch_tools: false` (no network probing of every catalog endpoint) so every existing agent gets a `hive_agent_embeddings` row and a scheduled eval gate, printing a summary table of registered / skipped / failed.

### Files to Create or Modify

- `scripts/hive-backfill-embeddings.ts` — create
- `package.json` — modify (add script `"hive:backfill": "tsx scripts/hive-backfill-embeddings.ts"`)

### Files to Leave Alone

- `lib/specialists/registry.ts`, `lib/specialists/catalog.ts` — read-only imports.
- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Create the script. Resolve `NEXT_PUBLIC_CONVEX_URL`: use `process.env.NEXT_PUBLIC_CONVEX_URL`, else parse `.env.local` lines for the key (simple `fs.readFileSync` + line split; ignore comments), else exit 1 with a clear message.
2. Build the worklist: map `SPECIALISTS` (skip entries with `tier === "disabled"` — already filtered — and skip `tier === "mock"` only if `INCLUDE_DEMO_MOCK_SPECIALISTS` excluded them; just take the array as exported) and `MCP_CATALOG` entries into `HiveAgentRegistration` shapes (`owner_id: sponsor`, `starting_reputation: cfg.starting_reputation ?? 0.55`, carry `mcp_endpoint`/`mcp_api_key_env`/`a2a_endpoint`/`a2a_agent_card_url`/`a2a_api_key_env`). Fetch `discovered_specialists` via `client.query(api.discoveredSpecialists.list, {})` and map those too. De-duplicate by `agent_id` with precedence: discovered row > static > catalog (the discovered row is the live source of truth).
3. For each item, `await client.action(api.hiveRegistry.registerAgent, { ...reg, fetch_tools: false })` inside try/catch; collect `{ agent_id, ok, error? }`. Run sequentially with a 200ms delay between calls (the eval gate fans out probes; do not stampede).
4. Print a final summary: total, succeeded, failed (with first line of each error), and a reminder that eval gates run asynchronously.
5. Add the npm script.

### New Types and Schemas

None — consumes `HiveAgentRegistration` from `lib/hive/registry-core.ts`.

### Success Criteria

- `npm run typecheck` passes.
- `npm run hive:backfill` against the dev deployment exits 0 and prints `succeeded >= 15` (static roster + catalog).
- `npx convex run hiveRegistry:searchAgents '{"query":"frontend ui generation","include_unevaluated":true}'` afterwards returns vercel-v0 among the top candidates.

### Notes

- `fetch_tools: false` is mandatory — fetching `tools/list` for ~20 catalog endpoints (many keyless) would hang the backfill on timeouts.
- Re-running is safe: `registerAgent` upserts and re-embeds.
- Agents whose eval gate fails stay out of hive routing but remain in the legacy auction untouched — expected for keyless catalog entries.

---

## Agent Task 9: DAG planner (`convex/hivePlanner.ts` + `lib/hive/dag.ts`)

**Delegate to:** fable
**Parallelizable:** No
**Depends on:** Agent Task 1 (Anthropic layer), Agent Task 3 (hive schema)

### Context

Arbor's current planner (`convex/planning.ts`, NOT to be modified) is strictly sequential: `decompose` makes one LLM call via `callOpenAIJSON` that returns `{ atomic } | { atomic: false, steps: [...] }` (2-4 linear steps stored on `tasks.task_plan`), `runStep` creates child task N only after child N-1 settles, and `synthesize` merges outputs. The hive mind replaces linearity with a dependency DAG executed in parallel where possible — as a NEW code path that leaves the legacy planner fully operational.

Agent Task 3 added the tables: `hive_dags` (`root_task_id`, `goal`, `status: planning|running|evaluating|complete|failed|escalated`, `planner_model`, `max_budget`, timestamps; index `by_root_task`) and `hive_nodes` (`dag_id`, `node_id` string, `description`, `depends_on: string[]`, `success_criteria?`, `task_class?`, `status: pending|ready|auctioned|executing|complete|failed`, `task_id?`, `assigned_agent_id?`, `output_text?`, `eval_score?`, `updated_at`; indexes `by_dag`, `by_dag_and_node_id`, `by_task_id`). Agent Task 1 created `lib/anthropic.ts` with `callClaudeJSON` and `CLAUDE_PLANNER_MODEL = "claude-fable-5"`. The planner contract from the product spec: accept a high-level goal, make a single `claude-fable-5` call that returns a task DAG as JSON where each node has `id`, `description`, `depends_on: string[]`; nodes with empty `depends_on` can run in parallel. Convex constraints: `"use node"` files export only actions; DB writes go through `internalMutation`s in a separate default-runtime file.

### Goal

A pure DAG domain module `lib/hive/dag.ts` (parse/validate/topology helpers with no Convex imports) plus `convex/hivePlanner.ts` (node action `planDag` that calls `claude-fable-5` once to decompose a goal into 1-8 nodes with dependencies, validates the DAG — unique ids, no dangling or cyclic `depends_on`, budget sanity — persists `hive_dags` + `hive_nodes` rows via mutations in a new `convex/hiveData.ts`, marks dependency-free nodes `ready`, and hands off to the orchestrator hook `internal.hiveOrchestrator.advance` which Agent Task 10 implements; until then the handoff is a logged scheduler call wrapped in try/catch).

### Files to Create or Modify

- `lib/hive/dag.ts` — create (pure: types, `validateDag`, `topologicalLevels`, `readyNodes`)
- `lib/hive/dag.test.ts` — create (cycle detection, dangling edge, parallel-level computation)
- `convex/hivePlanner.ts` — create (`"use node"`: `planDag` internalAction)
- `convex/hiveData.ts` — create (default runtime: `_insertDag`, `_insertNodes`, `_setDagStatus`, `_setNodeStatus`, `_getDag`, `_getNodes`, `_getNodeByDagAndNodeId`, `_patchNode`)
- `package.json` — modify (append `lib/hive/dag.test.ts` to the `test` chain)

### Files to Leave Alone

- `convex/planning.ts` — the legacy sequential planner keeps serving non-hive tasks; zero edits.
- `convex/tasks.ts` — wiring `tasks.post` into the hive path is Agent Task 19.
- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Create `lib/hive/dag.ts` with the types below. Implement `validateDag(nodes: PlannedNode[]): { ok: true } | { ok: false; error: string }`: 1-8 nodes; ids match `/^[a-z0-9][a-z0-9_-]{0,30}$/` and are unique; every `depends_on` entry references an existing id and never the node itself; Kahn's algorithm proves acyclicity; at least one node has empty `depends_on`.
2. Implement `topologicalLevels(nodes)` returning `string[][]` (level 0 = no deps, level N = deps all in earlier levels) and `readyNodes(nodes, statusByNodeId)` returning ids whose status is `"pending"` and whose every dependency has status `"complete"`.
3. Create `convex/hiveData.ts` (no `"use node"`) with the listed internal mutations/queries, all with full validators, all index-based (`by_dag`, `by_dag_and_node_id`, `by_task_id`). `_insertNodes` takes `{ dag_id, nodes: v.array(v.object({ node_id, description, depends_on, success_criteria: v.optional(v.string()), task_class: v.optional(v.string()) })) }` and inserts each with `status: "pending"`, `updated_at: Date.now()`.
4. Create `convex/hivePlanner.ts` (`"use node"`). System prompt for `claude-fable-5` (single call): role = planner for a multi-agent marketplace; decompose the goal into 1-8 task nodes; each node `{ "id": "<snake-or-kebab id>", "description": "<self-contained sub-task; the executing agent sees ONLY this plus shared-scratchpad context>", "depends_on": ["<ids>"], "success_criteria": "<one sentence: what makes this node's output acceptable>", "task_class": "reasoning"|"classification"|"extraction"|"generation" }`; nodes with empty depends_on run in parallel; prefer parallel structure over chains; do not pad — a simple goal is one node; output JSON only: `{ "nodes": [...] }`.
5. Implement `planDag = internalAction({ args: { task_id: v.id("tasks") }, handler })`: read the root task (`internal.tasks._get` in `convex/tasks.ts`); call `callClaudeJSON<{ nodes: PlannedNode[] }>` with `CLAUDE_PLANNER_MODEL`, maxTokens 1500, timeoutMs 45_000, retries 1; on model failure or `validateDag` failure, fall back to a single-node DAG (`[{ id: "main", description: task.prompt, depends_on: [] }]`) and log `[hive-planner] fallback single-node: <reason>`.
6. Persist: `_insertDag({ root_task_id, goal: task.prompt, status: "planning", planner_model: CLAUDE_PLANNER_MODEL, max_budget: task.max_budget, created_at, updated_at })`; `_insertNodes`; patch the root task's `hive_dag_id` via a new small mutation `_setHiveDagId` added to `convex/hiveData.ts` (patches `tasks` row fields `hive_dag_id`); set nodes with empty `depends_on` to `"ready"` via `_setNodeStatus`; set dag status `"running"`.
7. Log a lifecycle event on the root task via `internal.lifecycle.log` (`convex/lifecycle.ts`): `event_type: "hive_plan_decided"`, payload `{ dag_id, node_count, levels: topologicalLevels(...) }`.
8. Hand off: `try { await ctx.scheduler.runAfter(0, internal.hiveOrchestrator.advance, { dag_id }); } catch (err) { console.warn("[hive-planner] orchestrator not yet wired", err); }` with a `// Agent Task 10 implements internal.hiveOrchestrator.advance` comment.
9. Write `lib/hive/dag.test.ts` (tsx style): cycle rejected; dangling dep rejected; diamond DAG (a → b,c → d) yields levels `[["a"],["b","c"],["d"]]`; `readyNodes` unlocks `d` only when both `b` and `c` are complete. Append to the `package.json` test chain.
10. Push with `npx convex dev --once`.

### New Types and Schemas

```typescript
// lib/hive/dag.ts
export interface PlannedNode {
  id: string;
  description: string;
  depends_on: string[];
  success_criteria?: string;
  task_class?: "reasoning" | "classification" | "extraction" | "generation";
}

export function validateDag(nodes: PlannedNode[]): { ok: true } | { ok: false; error: string };
export function topologicalLevels(nodes: PlannedNode[]): string[][];
export function readyNodes(
  nodes: PlannedNode[],
  statusByNodeId: Record<string, string>,
): string[];
```

API contract: `internal.hivePlanner.planDag` (internalAction) args `{ task_id: Id<"tasks"> }`; `convex/hiveData.ts` internal functions as named in step 3 (consumed by Agent Tasks 10, 11, 14, 15).

### Success Criteria

- `npx tsx lib/hive/dag.test.ts` exits 0.
- `npx convex dev --once` pushes cleanly.
- With `ANTHROPIC_API_KEY` set on the Convex deployment: `npx convex run hivePlanner:planDag '{"task_id":"<existing task id>"}'` creates a `hive_dags` row with >= 1 `hive_nodes` rows, dependency-free nodes in status `ready`, and a `hive_plan_decided` lifecycle event (inspect via dashboard or `npx convex run lifecycle:forTask ...`).
- Without `ANTHROPIC_API_KEY`, the same call still succeeds via the single-node fallback.

### Notes

- The planner makes exactly ONE model call per spec; do not iterate or self-repair the DAG with more calls — validation failures fall back to single-node.
- `description` must be self-contained: the system prompt explicitly tells the model the executor sees only the node description plus scratchpad context (Agent Task 14 injects that context).
- Cap nodes at 8: each node costs a full 30s auction window; deep DAGs multiply wall-clock.


---

## Agent Task 10: DAG orchestrator (`convex/hiveOrchestrator.ts`)

**Delegate to:** fable
**Parallelizable:** No
**Depends on:** Agent Task 9 (planner), Agent Task 11 (router), Agent Task 13 (scratchpad)

### Context

Arbor's auction lifecycle is event-driven through the Convex scheduler: `convex/tasks.ts` `post` schedules `internal.planning.decompose`; `convex/auctions.ts` chains `solicitBids → resolve → execute → judge → settle`, and `settle` calls `internal.planning.advanceOrSynthesize` for child tasks (`task.parent_task_id` set). The hive path mirrors this but over a DAG: Agent Task 9's `internal.hivePlanner.planDag` persists `hive_dags` + `hive_nodes` (statuses `pending|ready|auctioned|executing|complete|failed`) and schedules `internal.hiveOrchestrator.advance({ dag_id })`, which this task implements. Agent Task 11 provides `internal.hiveRouter.routeNode({ dag_id, node_id })` — it creates a child `tasks` row scoped to a shortlist (`invited_agent_ids`) and starts the existing Vickrey auction on it, marking the node `auctioned`. Node completion is signaled by the auction settle phase: Agent Task 19 patches the settle hook so hive child tasks (those with `hive_node_id` set, column added in Agent Task 3) schedule `internal.hiveOrchestrator.onNodeSettled({ task_id })` — this task must implement that receiver now so Task 19 only adds the dispatch. `lib/hive/dag.ts` exposes `readyNodes(nodes, statusByNodeId)`. `convex/hiveData.ts` has `_getDag`, `_getNodes`, `_setDagStatus`, `_setNodeStatus`, `_patchNode`, `_getNodeByDagAndNodeId`. Scratchpad writes go through `internal.scratchpad._write` (Agent Task 13).

### Goal

The hive execution engine: an `advance` action that finds all `ready` nodes for a DAG and routes each one in parallel via `internal.hiveRouter.routeNode`, an `onNodeSettled` action that records a settled child task's outcome onto its node (output text, assigned agent, complete/failed status), writes the node result into the shared scratchpad with the judge's quality score as confidence, unlocks newly-ready dependents, re-invokes `advance`, and — when no pending/ready/executing nodes remain — transitions the DAG to `evaluating` and hands off to `internal.hiveEvaluator.evaluateDag` (Agent Task 15; until then a logged try/catch), with failed nodes propagating failure to dependents.

### Files to Create or Modify

- `convex/hiveOrchestrator.ts` — create (`"use node"`: `advance`, `onNodeSettled` internalActions)
- `convex/hiveData.ts` — modify (add `_getNodeByTaskId` internalQuery using index `by_task_id`; add `_countNodesByStatus` internalQuery returning `{ pending, ready, auctioned, executing, complete, failed }` for a dag via `by_dag` + in-memory tally)

### Files to Leave Alone

- `convex/auctions.ts` — only Agent Task 12 touches it; the settle hook dispatch is Agent Task 19.
- `convex/planning.ts` — legacy sequential planner untouched.
- `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Create `convex/hiveOrchestrator.ts` with `"use node"`.
2. Implement `advance = internalAction({ args: { dag_id: v.id("hive_dags") }, handler })`: load dag + nodes (`_getDag`, `_getNodes`); if dag status is `complete|failed|escalated`, return. Compute ready set: nodes already in status `"ready"` PLUS nodes in `"pending"` whose every `depends_on` target is `"complete"` (use `readyNodes` from `lib/hive/dag.ts` for the pending check, passing a statusByNodeId map). For each, first `_setNodeStatus(..., "auctioned")` (claim before scheduling to make repeat `advance` calls idempotent — a node is only routed from `pending|ready`), then `ctx.scheduler.runAfter(0, internal.hiveRouter.routeNode, { dag_id, node_id })`. Schedule all ready nodes in the same call — this is the parallelism point.
3. Failure propagation inside `advance`: any `pending` node with a dependency in status `"failed"` is itself marked `"failed"` with `_patchNode` setting `output_text: "skipped: dependency <id> failed"`; loop until fixpoint.
4. Completion check inside `advance`: via `_countNodesByStatus`, if `pending + ready + auctioned + executing === 0`: set dag status `"evaluating"` and `try { ctx.scheduler.runAfter(0, internal.hiveEvaluator.evaluateDag, { dag_id }); } catch { console.warn("[hive-orchestrator] evaluator not yet wired"); }` with a `// Agent Task 15` comment. If every node failed, set dag status `"failed"` instead and log lifecycle `hive_dag_failed` on the root task.
5. Implement `onNodeSettled = internalAction({ args: { task_id: v.id("tasks") }, handler })`: find the node via `_getNodeByTaskId`; if none, return (non-hive task — defensive). Read the task (`internal.tasks._get`): extract `result.text` (same duck-typing as `convex/planning.ts` synthesize, lines 287-297), `result.agent_id`, and `judge_verdict.quality_score`. Task status `"complete"` → node `"complete"`; `"disputed"` → node `"complete"` as well but record `eval_score` from the verdict (the hive evaluator re-judges; a judge-rejected node output is still material) — EXCEPT when there is no result text at all; `"failed"|"cancelled"` → node `"failed"`. Patch the node: `status`, `assigned_agent_id`, `output_text` (truncate to 50_000 chars), `eval_score: quality_score`, `updated_at`.
6. Scratchpad write on completion: `ctx.runMutation(internal.scratchpad._write, { dag_id, node_id, task_id, agent_id: assigned_agent_id ?? "unknown", kind: "result", content: <first 8000 chars of output_text>, confidence: quality_score ?? 0.5 })` then `ctx.scheduler.runAfter(0, internal.scratchpad.embedEntry, { entry_id })` (Agent Task 13's async embed; `_write` returns the entry id).
7. End of `onNodeSettled`: `ctx.scheduler.runAfter(0, internal.hiveOrchestrator.advance, { dag_id })`.
8. Log lifecycle events on the DAG's root task (`_getDag` gives `root_task_id`): `hive_node_settled` with `{ node_id, status, agent_id, quality_score }`.
9. Push with `npx convex dev --once`.

### New Types and Schemas

No new tables. API contract:
- `internal.hiveOrchestrator.advance` — args `{ dag_id: Id<"hive_dags"> }`.
- `internal.hiveOrchestrator.onNodeSettled` — args `{ task_id: Id<"tasks"> }` (called by the settle dispatch added in Agent Task 19).

### Success Criteria

- `npx convex dev --once` pushes cleanly.
- Manual chain test on the dev deployment: run `hivePlanner:planDag` on a task whose prompt is compound (e.g. "Research the top three A2A agent registries, then write a comparison summary"); observe via the Convex dashboard that (a) level-0 nodes flip to `auctioned` together, (b) after their auctions settle, `onNodeSettled` flips them `complete` and dependents become `auctioned`, (c) when all nodes are terminal the dag row shows `evaluating` (or `failed` if all nodes failed).
- Calling `advance` twice in a row never double-routes a node (statuses move strictly forward).

### Notes

- Idempotency is the core risk: Convex scheduler can deliver duplicate work under retries. The claim-before-schedule pattern in step 2 plus "only route from pending|ready" makes `advance` safe to call any number of times.
- A node whose auction's judge rejected the output still completes the node — the Layer 5 evaluator (not the per-task judge) owns hive-level accept/reject and conflict resolution.
- Budget: routeNode (Task 11) computes per-node budget; the orchestrator does not split budgets.

---

## Agent Task 11: Hive router (`convex/hiveRouter.ts` + `lib/hive/router-core.ts`)

**Delegate to:** opus
**Parallelizable:** No
**Depends on:** Agent Task 2 (embeddings), Agent Task 4 (registry search), Agent Task 9 (hiveData), Agent Task 12 (invited-bidder auction extension)

### Context

Arbor routes work through a Vickrey second-price auction in `convex/auctions.ts`: `solicitBids` invites a roster, collects sealed bids (score = reputation / price, gated by liveness probes), and `resolve` picks the winner at the second price — this logic is reused, never reimplemented. Agent Task 12 extends `solicitBids` so that when a task row has `invited_agent_ids: string[]` set (column from Agent Task 3), only those agents are invited. Child tasks are created with `internal.tasks._createChild` (`convex/tasks.ts`, args `{ parent_task_id, step_index, prompt, max_budget }`) which inherits the parent's context and schedules nothing itself; the legacy planner then schedules `internal.contextEnrichment.enrichAndStartAuction` — the hive router instead schedules `internal.auctions.solicitBids` immediately and `internal.auctions.resolve` after `BID_WINDOW_SECONDS * 1000` ms (constant exported from `convex/tasks.ts`), the exact pattern in `convex/planning.ts` decompose lines 66-75.

Agent Task 4 provides `api.hiveRegistry.searchAgents` (embeds a query, `ctx.vectorSearch` over eval-passed agents, reputation/cost post-filter, returns `HiveAgentCandidate[]` with `similarity`). Agent Task 9's `convex/hiveData.ts` has node accessors (`_getDag`, `_getNodeByDagAndNodeId`, `_patchNode`) and Agent Task 3 added `tasks.hive_dag_id`, `tasks.hive_node_id`, `tasks.invited_agent_ids`, `tasks.success_criteria`. Model routing rule: classify each node with `claude-haiku-4-5-20251001` (`CLAUDE_FAST_MODEL` in `lib/anthropic.ts`) when the planner did not already set `task_class`; the class is stored on the node and stamped into the child task prompt so executors and the evaluator know whether deep reasoning (`claude-fable-5`-grade work) or fast classification/extraction is expected.

### Goal

`internal.hiveRouter.routeNode({ dag_id, node_id })`: build the node's routing query (description + success criteria + scratchpad hints), get top-K candidates from `searchAgents` (K=6, min_reputation 0.3, max_cost = per-node budget), fall back to the open un-invited auction when fewer than 2 candidates qualify, classify `task_class` with haiku when missing, create the child task via `_createChild` patched with `hive_dag_id`/`hive_node_id`/`invited_agent_ids`/`success_criteria`, mark the node `executing` with its `task_id`, and schedule the EXISTING `internal.auctions.solicitBids` + `internal.auctions.resolve` pair — so the Vickrey mechanism, probes, plan screen, escrow, judge, and settle all run unchanged on a shortlisted field.

### Files to Create or Modify

- `lib/hive/router-core.ts` — create (pure helpers: routing query assembly, per-node budget split, candidate threshold logic)
- `lib/hive/router-core.test.ts` — create
- `convex/hiveRouter.ts` — create (`"use node"`: `routeNode` internalAction)
- `convex/hiveData.ts` — modify (add `_patchTaskHiveFields` internalMutation: args `{ task_id: v.id("tasks"), hive_dag_id: v.id("hive_dags"), hive_node_id: v.string(), invited_agent_ids: v.optional(v.array(v.string())), success_criteria: v.optional(v.string()) }`, patches the tasks row)
- `package.json` — modify (append the new test)

### Files to Leave Alone

- `convex/auctions.ts` — consumed via scheduler references only (Agent Task 12 already added the invited filter).
- `convex/tasks.ts` — `_createChild` used as-is; hive fields are patched separately via `_patchTaskHiveFields` to avoid touching the legacy mutation signature.
- `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Create `lib/hive/router-core.ts`: `buildRoutingQuery(node: { description: string; success_criteria?: string }, scratchpadHints: string[]): string` (description + criteria + up to 3 hint lines, total <= 1500 chars); `perNodeBudget(dagBudget: number, nodeCount: number): number` (`Number((dagBudget / Math.max(1, nodeCount)).toFixed(2))` — even split, same invariant as `convex/planning.ts` runStep); `shouldFallbackOpen(candidates: Array<{ similarity: number }>): boolean` (true when fewer than 2 candidates OR best similarity < 0.15).
2. Test those three functions in `lib/hive/router-core.test.ts` (tsx style); append to `package.json` test chain.
3. Create `convex/hiveRouter.ts` (`"use node"`). Implement `routeNode = internalAction({ args: { dag_id: v.id("hive_dags"), node_id: v.string() }, handler })`.
4. Load dag + node (`_getDag`, `_getNodeByDagAndNodeId`); bail (console.warn) unless node status is `"auctioned"` (the orchestrator's claim) — this keeps duplicate scheduler deliveries harmless.
5. Read up to 3 recent scratchpad entries for the dag via `internal.scratchpad._recent` if it exists (Agent Task 13; wrap in try/catch and default to `[]` so this task lands independently — leave a `// Agent Task 13` comment).
6. Classify: if `node.task_class` is unset, call `callClaudeJSON<{ task_class: string }>` with `CLAUDE_FAST_MODEL`, maxTokens 64, system prompt instructing exactly one of `reasoning|classification|extraction|generation`; default `"reasoning"` on any error; persist via `_patchNode`.
7. Candidates: `const budget = perNodeBudget(dag.max_budget, nodeCount)` (get nodeCount from `_getNodes` length); call `ctx.runAction(api.hiveRegistry.searchAgents, { query: buildRoutingQuery(...), top_k: 6, min_reputation: 0.3, max_cost: budget })`. Compute `invited = shouldFallbackOpen(candidates) ? undefined : candidates.map(c => c.agent_id)`.
8. Create the child task: `const { child_task_id } = await ctx.runMutation(internal.tasks._createChild, { parent_task_id: dag.root_task_id, step_index: <stable index of node within dag (sort node_ids, use position)>, prompt: <node description + "\n\nSuccess criteria: " + criteria + task-class line; scratchpad context injection itself is Agent Task 14>, max_budget: budget })`; then `ctx.runMutation(internal.hiveData._patchTaskHiveFields, { task_id: child_task_id, hive_dag_id: dag_id, hive_node_id: node_id, invited_agent_ids: invited, success_criteria: node.success_criteria })`.
9. Mark the node: `_patchNode({ ..., status: "executing", task_id: child_task_id })`. NOTE: `parent_task_id` being set on the child means `convex/auctions.ts` settle will call `internal.planning.advanceOrSynthesize` — that function returns immediately for our children only after Agent Task 19 adds the hive guard; until then it would try to advance the LEGACY plan. Mitigation now: `_createChild` requires `parent_task_id`, so pass it, and rely on `advanceOrSynthesize`'s behavior: it reads `parent.task_plan ?? []` → totalSteps 0 → `nextIndex < 0+...` is false → it schedules `planning.synthesize` on the parent. That is wrong for hive parents, so Agent Task 19 MUST land before end-to-end runs; document this in the task output. Do not work around it here.
10. Lifecycle log on the root task: `hive_node_routed` with `{ node_id, child_task_id, invited: invited ?? "open", candidate_count, task_class, budget }`.
11. Schedule the auction: `await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, { task_id: child_task_id }); await ctx.scheduler.runAfter(BID_WINDOW_SECONDS * 1000, internal.auctions.resolve, { task_id: child_task_id });` importing `BID_WINDOW_SECONDS` from `./tasks`.
12. Push with `npx convex dev --once`.

### New Types and Schemas

```typescript
// lib/hive/router-core.ts
export function buildRoutingQuery(
  node: { description: string; success_criteria?: string },
  scratchpadHints: string[],
): string;
export function perNodeBudget(dagBudget: number, nodeCount: number): number;
export function shouldFallbackOpen(candidates: Array<{ similarity: number }>): boolean;
```

API contract: `internal.hiveRouter.routeNode` (internalAction) args `{ dag_id, node_id }`.

### Success Criteria

- `npx tsx lib/hive/router-core.test.ts` exits 0; `npm run typecheck` passes; `npx convex dev --once` pushes.
- On the dev deployment with backfilled embeddings (Agent Task 8): `npx convex run hiveRouter:routeNode '{"dag_id":"<id>","node_id":"<ready node claimed as auctioned>"}'` creates a child task whose row shows `invited_agent_ids` populated (or absent for fallback), `hive_node_id` set, and bids arriving only from invited agents within the 30s window (verify in `bid_probes` / `lifecycle_events`).
- The `hive_node_routed` lifecycle event appears on the root task.

### Notes

- The Vickrey rule is untouched: shortlisting happens before the auction, pricing inside it. Honest-bidding incentives are preserved because invited bidders still face sealed second-price rules.
- Fallback-to-open keeps the hive usable before the registry is well-populated; it is also the safety valve if vector search degrades.
- The model-routing rule (`fable` for reasoning, `haiku` for classification) is metadata at this layer — external agents choose their own models; Arbor's own judge/evaluator calls honor it (Tasks 5, 15).

---

## Agent Task 12: Invited-bidder extension to the Vickrey auctioneer (`convex/auctions.ts`)

**Delegate to:** opus
**Parallelizable:** No
**Depends on:** Agent Task 3 (schema: `tasks.invited_agent_ids`)

### Context

This is the ONLY task authorized to edit `convex/auctions.ts`, and the edit is strictly additive. In `solicitBids` (internalAction, starts ~line 329), the roster is assembled as `const roster = [...SPECIALISTS, ...discoveredConfigs, ...catalogConfigs];` (~line 431) and then filtered once: `const invitedSpecialists: SpecialistConfig[] = task.task_type === "reacher-live-launch" ? SPECIALISTS.filter((spec) => spec.agent_id === "reacher-social") : roster;` (~line 450). Every subsequent step — `_ensureAgent` seeding, concurrent probe+bid, plan-plausibility screen, sealed `bids._insert`, lifecycle logging — operates on `invitedSpecialists` and must remain byte-identical. The `task` object in scope comes from `internal.tasks._get` and, after Agent Task 3, may carry `invited_agent_ids?: string[]` (set by the hive router, Agent Task 11, on hive child tasks; absent on every legacy task). `resolve`, `execute`, `judge`, and `settle` are not modified by this task at all. The Vickrey mechanism (sort by score, second price) is a hard constraint to preserve: restricting WHO is invited is allowed; changing scoring or pricing is not.

### Goal

`solicitBids` honors an optional per-task shortlist: when `task.invited_agent_ids` is a non-empty array, the invited specialist set is the existing roster filtered to those agent ids (preserving the reacher-live-launch special case, which takes precedence), with a lifecycle event recording the restriction, and identical behavior to today when the field is absent or empty.

### Files to Create or Modify

- `convex/auctions.ts` — modify (one filter expression + one lifecycle log; nothing else)

### Files to Leave Alone

- Everything else in `convex/auctions.ts` — `resolve` (Vickrey pricing), `execute` (failover), `judge`, `settle`, `assessPlanPlausibility`, the probe/bid concurrency, the demo-lane policy: zero changes.
- `convex/tasks.ts`, `convex/schema.ts` — the column already exists (Agent Task 3).
- `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Locate the `invitedSpecialists` ternary (~line 450). Replace with:

```typescript
    const invitedIds =
      Array.isArray(task.invited_agent_ids) && task.invited_agent_ids.length > 0
        ? new Set(task.invited_agent_ids)
        : null;
    const invitedSpecialists: SpecialistConfig[] =
      task.task_type === "reacher-live-launch"
        ? SPECIALISTS.filter((spec) => spec.agent_id === "reacher-social")
        : invitedIds
          ? roster.filter((spec) => invitedIds.has(spec.agent_id))
          : roster;
```

2. Immediately after, when `invitedIds` is non-null, log one lifecycle event: `await ctx.runMutation(internal.lifecycle.log, { task_id: args.task_id, event_type: "auction_shortlisted", payload: { invited_agent_ids: task.invited_agent_ids, matched: invitedSpecialists.map((s) => s.agent_id) } });`
3. Defensive guard: if `invitedIds` is non-null and `invitedSpecialists.length === 0`, fall back to the full `roster` and log `auction_shortlist_empty` instead — an over-restrictive shortlist must degrade to the open auction, never to a guaranteed `auction_failed`.
4. Push with `npx convex dev --once` and run one legacy task end-to-end to confirm unchanged behavior.

### New Types and Schemas

None. New lifecycle `event_type` strings (free-form `v.string()` in schema): `"auction_shortlisted"`, `"auction_shortlist_empty"`.

### Success Criteria

- `git diff convex/auctions.ts` shows exactly one hunk around the `invitedSpecialists` definition plus the logging/guard lines — no changes to `resolve`/`execute`/`judge`/`settle`.
- A legacy task (no `invited_agent_ids`) posted via the UI or `POST /api/v1/tasks` runs bidding → award → settle exactly as before (compare lifecycle event sequence).
- A task manually patched with `invited_agent_ids: ["nia-context"]` receives bids/declines only from `nia-context` (check `bid_probes` rows and `bid_received`/`bid_declined` lifecycle events).
- `npx convex dev --once` pushes cleanly.

### Notes

- The shortlist filters the ASSEMBLED roster; agents not in `SPECIALISTS`/discovered/catalog cannot be summoned by id alone — the hive registry guarantees invited ids exist in `discovered_specialists`, which feeds `discoveredConfigs`.
- Keep the reacher-live-launch branch first: it is a sponsor-demo invariant.
- Do not touch the `_ensureAgent` seeding loop above the filter; it intentionally seeds the FULL roster so reputation rows exist regardless of shortlists.

---

## Agent Task 13: Shared context store (`convex/scratchpad.ts` + `lib/hive/context-store.ts`)

**Delegate to:** sonnet
**Parallelizable:** No
**Depends on:** Agent Task 2 (embeddings), Agent Task 3 (schema)

### Context

The hive's Layer 4 is a stigmergy scratchpad: agents never talk to each other directly; they read and write a shared store, every write stamped with `agent_id`, `task_id`, timestamp, and a confidence float. Agent Task 3 created the Convex table `scratchpad_entries`: `{ dag_id: Id<"hive_dags">, node_id?, task_id?, agent_id, kind: observation|result|decision|question, content, confidence, embedding? (1536 float64), embedding_model?, created_at }` with indexes `by_dag`, `by_dag_and_node` and vector index `by_embedding` (filterFields `["dag_id"]`). Agent Task 2 created `lib/hive/embeddings.ts` (`embedText`, `embeddingBackend`). Convex rules: vector search only in actions (`ctx.vectorSearch("scratchpad_entries", "by_embedding", { vector, limit, filter: (q) => q.eq("dag_id", dagId) })` returning `{ _id, _score }`); mutations cannot embed (no fetch budget should sit in a transaction), so writes land instantly un-embedded and an async action embeds them after.

The product spec calls for hot state in Upstash Redis, semantic retrieval in a vector store, and provenance in Postgres. This repo has exactly one backend — Convex — which already provides sub-100ms reactive reads/writes (hot state), native vector indexes (semantic retrieval), and durable indexed tables (provenance), and there are no Upstash/Postgres credentials anywhere in `.env.example` or `.env.local`. Per the "no new databases unless the existing one provably cannot support the requirement" rule, all three roles are implemented in Convex behind a single interface so an Upstash adapter can be introduced later without touching callers. Consumers: the orchestrator writes node results (Agent Task 10), the router reads recent hints (Agent Task 11), prompt injection reads relevant entries (Agent Task 14), the evaluator reads everything for a dag (Agent Task 15), and external agents get REST access (Agent Task 20).

### Goal

A complete scratchpad backend: `convex/scratchpad.ts` (default runtime) with `_write` internalMutation (stamps `created_at`, clamps confidence to 0..1, returns the entry id), `_recent` and `_forDag` and `_forNode` internalQueries, a public `forDag` query for the UI/REST, plus `convex/scratchpadActions.ts` (`"use node"`) with `embedEntry` internalAction (embeds one entry's content and patches `embedding`/`embedding_model`), `write` public action (validated external write path: looks up the dag, writes, schedules embedding), and `semanticRecall` action (embeds a query, vector-searches within a dag, hydrates and returns scored entries) — with the pure client-side types in `lib/hive/context-store.ts`.

### Files to Create or Modify

- `lib/hive/context-store.ts` — create (types + `formatEntriesForPrompt(entries, maxChars)` pure helper)
- `convex/scratchpad.ts` — create (default runtime: `_write`, `_patchEmbedding`, `_recent`, `_forDag`, `_forNode`, `_getEntry`, public `forDag`)
- `convex/scratchpadActions.ts` — create (`"use node"`: `embedEntry`, `write`, `semanticRecall`)
- `lib/hive/context-store.test.ts` — create (tests `formatEntriesForPrompt` truncation/ordering)
- `package.json` — modify (append the test)

### Files to Leave Alone

- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- `convex/taskContexts.ts` — the legacy per-task context system stays independent.

### Implementation Steps

1. Create `lib/hive/context-store.ts` with `ScratchpadEntry` and `ScratchpadWrite` types (below) and `formatEntriesForPrompt(entries: Array<{ agent_id: string; kind: string; confidence: number; content: string; created_at: number }>, maxChars = 4000): string` — newest-last, each line `"- [<kind> by <agent_id>, confidence <0.00>] <content truncated to 500 chars>"`, total clamped to maxChars by dropping oldest first, empty string for no entries.
2. Create `convex/scratchpad.ts`. `_write` internalMutation args: `{ dag_id: v.id("hive_dags"), node_id: v.optional(v.string()), task_id: v.optional(v.id("tasks")), agent_id: v.string(), kind: v.union(4 literals), content: v.string(), confidence: v.number() }`; clamp confidence `Math.max(0, Math.min(1, x))`; truncate content to 16_000 chars; insert with `created_at: Date.now()`; return the id.
3. `_patchEmbedding` internalMutation: `{ entry_id: v.id("scratchpad_entries"), embedding: v.array(v.float64()), embedding_model: v.string() }`.
4. Queries (all `withIndex`, `.order("desc")`, `.take(n)`): `_recent` `{ dag_id, limit?: number }` (default 5, max 50); `_forDag` `{ dag_id }` (take 200); `_forNode` `{ dag_id, node_id }` (take 50, index `by_dag_and_node`); `_getEntry` by id; public `forDag` mirroring `_forDag` minus embeddings (map out the `embedding` field — entries are small but vectors are 12KB each).
5. Create `convex/scratchpadActions.ts` (`"use node"`). `embedEntry` internalAction `{ entry_id }`: read via `_getEntry`; skip if already embedded; `embedText(content)`; `_patchEmbedding`. Failures log and return (an un-embedded entry still serves indexed reads).
6. `write` public action with the `ScratchpadWrite` fields as validators: verify the dag exists (`internal.hiveData._getDag` — wrap in try/catch, throw a clean "unknown dag_id" error); `_write`; `ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, { entry_id })`; return `{ entry_id }`.
7. `semanticRecall` public action `{ dag_id: v.id("hive_dags"), query: v.string(), limit: v.optional(v.number()) }`: embed query; `ctx.vectorSearch` with `filter: (q) => q.eq("dag_id", dag_id)`, limit clamped 1..20; hydrate via `_getEntry` for each hit; return `[{ entry: <sans embedding>, score }]` sorted by score desc.
8. Test + push (`npx convex dev --once`).

### New Types and Schemas

```typescript
// lib/hive/context-store.ts
export interface ScratchpadWrite {
  dag_id: string;
  node_id?: string;
  task_id?: string;
  agent_id: string;
  kind: "observation" | "result" | "decision" | "question";
  content: string;
  confidence: number; // 0..1
}

export interface ScratchpadEntry extends ScratchpadWrite {
  entry_id: string;
  created_at: number;
  embedding_model?: string;
}

export function formatEntriesForPrompt(
  entries: Array<{ agent_id: string; kind: string; confidence: number; content: string; created_at: number }>,
  maxChars?: number,
): string;
```

API contract: `internal.scratchpad._write` / `_recent` / `_forDag` / `_forNode`; `api.scratchpad.forDag`; `api.scratchpadActions.write`; `api.scratchpadActions.semanticRecall`; `internal.scratchpadActions.embedEntry`.

### Success Criteria

- `npx tsx lib/hive/context-store.test.ts` exits 0; `npx convex dev --once` pushes.
- `npx convex run scratchpadActions:write '{"dag_id":"<real dag id>","agent_id":"smoke","kind":"observation","content":"The repo uses Convex with a 30 second bid window.","confidence":0.9}'` returns an entry id; a few seconds later the row has an `embedding` array of length 1536.
- `npx convex run scratchpadActions:semanticRecall '{"dag_id":"<same>","query":"how long is the bidding window"}'` returns that entry with a positive score.
- Writes to dag A are never returned by `semanticRecall` on dag B.

### Notes

- Justification for no Upstash Redis (required by the plan's tech-stack rule): no Upstash credentials exist in this project; Convex mutations are the platform's hot path (reactive, low-latency, Vercel-native) and adding Redis would create a second source of truth with no consumer that needs sub-Convex latency. The `lib/hive/context-store.ts` interface is the seam where a Redis adapter would slot in if scale demands it.
- Provenance is inherent: every entry carries agent_id/task_id/created_at/confidence and Convex retains `_creationTime`; no separate provenance log table is needed.
- Strip `embedding` from everything returned publicly — 1536 floats per row bloats payloads 10x.

---

## Agent Task 14: Scratchpad context injection into node execution

**Delegate to:** opus
**Parallelizable:** No
**Depends on:** Agent Task 10 (orchestrator), Agent Task 11 (router), Agent Task 13 (scratchpad)

### Context

Hive node tasks are created by `internal.hiveRouter.routeNode` (`convex/hiveRouter.ts`, Agent Task 11) via `internal.tasks._createChild`, with the child prompt currently containing only the node description, success criteria, and task class. The stigmergy model requires executing agents to SEE what sibling agents already learned: results and observations accumulate in `scratchpad_entries` (Agent Task 13) as nodes complete (the orchestrator's `onNodeSettled` writes `kind: "result"` entries with judge-score confidence, Agent Task 10 step 6). Two read paths exist: `internal.scratchpad._forDag` / `_recent` (indexed, recency-ordered) and `api.scratchpadActions.semanticRecall` (vector search scoped to the dag). `lib/hive/context-store.ts` exports `formatEntriesForPrompt(entries, maxChars)`.

Injection must happen at child-task creation time inside `routeNode`, because the prompt is frozen into the `tasks` row that the auction's `solicitBids` and `execute` read (`promptForAgents` / `promptForExecution` in `convex/auctions.ts` simply append the legacy `task_contexts.prompt_addendum`). Additionally, dependency outputs deserve priority over generic recency: a node whose `depends_on` lists nodes b and c must always receive b's and c's `output_text`-derived scratchpad entries (`_forNode` per dependency), with semantic recall filling remaining budget. This task also adds the inverse write path for richer provenance: when a node task starts executing, write a `decision` entry recording which agent won at what price, so later nodes (and the evaluator) can see routing history in-band.

### Goal

Hive child-task prompts gain a structured shared-context section assembled at routing time — all `result` entries from direct dependency nodes first, then top semantic-recall matches for the node description, formatted via `formatEntriesForPrompt` under a hard 4000-char budget with an explicit "Shared scratchpad (written by other agents; verify before relying on low-confidence items)" header — and the router writes a `decision` scratchpad entry after the child auction resolves is not possible at routing time, so instead `onNodeSettled` (already writing `result`) is extended to also write a compact `decision` entry naming winner and price.

### Files to Create or Modify

- `convex/hiveRouter.ts` — modify (assemble and inject the context block into the child prompt inside `routeNode`)
- `convex/hiveOrchestrator.ts` — modify (in `onNodeSettled`, additionally write a `decision` entry: `content: "node <id> executed by <agent_id> at price <price_paid>; judge quality <score>"`, `confidence: 1.0`)
- `lib/hive/context-store.ts` — modify (add `assembleNodeContext` pure helper that merges dependency entries + recall entries, de-duplicates by entry id, orders dependencies first, and applies the char budget by delegating to `formatEntriesForPrompt`)
- `lib/hive/context-store.test.ts` — modify (cover `assembleNodeContext` de-dup and ordering)

### Files to Leave Alone

- `convex/auctions.ts` — the prompt arrives via the task row; the auctioneer needs no knowledge of scratchpads.
- `convex/scratchpad.ts` / `convex/scratchpadActions.ts` — read APIs are sufficient as built.
- `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. In `lib/hive/context-store.ts`, add `assembleNodeContext(args: { dependencyEntries: EntryLike[]; recallEntries: EntryLike[]; maxChars?: number }): string` where `EntryLike` is the same structural type `formatEntriesForPrompt` takes plus an optional `entry_id` for de-dup; dependency entries always come first; result is `""` when both lists are empty.
2. In `convex/hiveRouter.ts` `routeNode`, after loading the node and before building the child prompt: for each `node.depends_on` id, `ctx.runQuery(internal.scratchpad._forNode, { dag_id, node_id: depId })` and keep `kind === "result"` entries (max 2 per dependency, newest first); then `ctx.runAction(api.scratchpadActions.semanticRecall, { dag_id, query: node.description, limit: 5 })` in a try/catch defaulting to `[]`.
3. Build `const sharedContext = assembleNodeContext({ dependencyEntries, recallEntries: recall.map(r => r.entry), maxChars: 4000 });` and, when non-empty, append to the child prompt:

```
---
Shared scratchpad (written by other agents in this hive task; verify before relying on low-confidence items):
<sharedContext>
---
```

4. Replace the step-5 placeholder from Agent Task 11 (`_recent` hints in the routing query) to source hints from the same dependency entries (first 100 chars each) — one read path, used twice.
5. In `convex/hiveOrchestrator.ts` `onNodeSettled`, after the existing `result` write, read `price_paid` from the settled task row and write the `decision` entry via `internal.scratchpad._write` (no embedding scheduling needed for one-liners — still schedule `embedEntry`; uniformity beats micro-optimizing).
6. Update the test; run `npx tsx lib/hive/context-store.test.ts`; push with `npx convex dev --once`.

### New Types and Schemas

```typescript
// lib/hive/context-store.ts (addition)
export function assembleNodeContext(args: {
  dependencyEntries: Array<{ entry_id?: string; agent_id: string; kind: string; confidence: number; content: string; created_at: number }>;
  recallEntries: Array<{ entry_id?: string; agent_id: string; kind: string; confidence: number; content: string; created_at: number }>;
  maxChars?: number;
}): string;
```

### Success Criteria

- Tests pass; `npx convex dev --once` pushes.
- End-to-end on dev (requires Agent Task 19 for full automation, or manual chaining): a 2-level DAG where node `summarize` depends on node `research` produces a `summarize` child task whose `prompt` field (visible in the Convex dashboard `tasks` row) contains the "Shared scratchpad" header and text from `research`'s output.
- `scratchpad_entries` for the dag contains both `result` and `decision` entries after each node settles.

### Notes

- The 4000-char budget is deliberate: bid prompts already carry `buildTaskContext` framing plus the legacy addendum; oversized prompts degrade the 10s bid timeout in `lib/specialists/base.ts`.
- Low-confidence entries are included but labeled (confidence is printed per line by `formatEntriesForPrompt`); filtering below 0.3 is the evaluator's job, not injection's.
- Dependency outputs trump semantic recall because `depends_on` is the planner's explicit data-flow statement.


---

## Agent Task 15: Hive evaluator (Layer 5) — `convex/hiveEvaluator.ts`

**Delegate to:** fable
**Parallelizable:** No
**Depends on:** Agent Task 1 (Anthropic), Agent Task 10 (orchestrator), Agent Task 13 (scratchpad), Agent Task 9 (hiveData)

### Context

Arbor already has a per-task LLM judge in `convex/auctions.ts` (`judge`, `JUDGE_GENERAL_PROMPT`, verdict `{ verdict: "accept"|"reject", reasoning, quality_score }`) — that runs inside every node's own auction and is NOT the hive evaluator. Layer 5 is a DAG-level evaluator that runs after all nodes reach a terminal state: the orchestrator (`convex/hiveOrchestrator.ts`, Agent Task 10) sets `hive_dags.status = "evaluating"` and schedules `internal.hiveEvaluator.evaluateDag({ dag_id })`. The product spec: an LLM judge (`claude-fable-5`) scores each node output against the node's success criteria, detects conflicts between agents that worked overlapping nodes, picks or synthesizes the winning output, updates reputation, and escalates to human review when confidence is below threshold OR two conflicting outputs are within 5% of each other in score.

Available building blocks: Agent Task 3's `hive_evaluations` table (`dag_id`, `node_id?`, `agent_id`, `score`, `verdict`, `reasoning`, `conflicts_with?`, `judge_model`, `created_at`; index `by_dag`) and `escalations` table (`dag_id?`, `task_id`, `kind: "low_confidence"|"conflict_tie"`, `reason`, `payload?`, `status: "open"|"resolved"`, `created_at`; indexes `by_status`, `by_task`). Agent Task 9's `convex/hiveData.ts` has `_getDag`, `_getNodes`, `_setDagStatus`, `_patchNode`. Agent Task 13's `internal.scratchpad._forDag` returns all entries. Agent Task 1's `callClaudeJSON` + `CLAUDE_PLANNER_MODEL = "claude-fable-5"`. Reputation is updated through `internal.agents._applyReputationDelta` (`convex/agents.ts`, args `{ agent_id, task_id, delta, event_type, reasoning, increment_completed, increment_disputes_lost }`, clamps 0.05..1.0). The DAG's final synthesized answer must land on the ROOT task's `result` so the existing task UI renders it; the root task is `dag.root_task_id`.

### Goal

`internal.hiveEvaluator.evaluateDag({ dag_id })`: load all nodes and their outputs plus the scratchpad, make ONE `claude-fable-5` call that returns per-node scores + verdicts, detected cross-node conflicts, and a synthesized final answer keyed to the original goal; persist `hive_evaluations` rows; apply reputation deltas to each node's assigned agent (reward accepted, penalize rejected) reusing `_applyReputationDelta` and refreshing the agent's registry embedding snapshot via `internal.hiveRegistry.refreshEmbedding`; write the synthesized answer to the root task's `result` and `judge_verdict`; set the DAG `complete`; and open an `escalations` row (and set DAG status `escalated`) when overall confidence < 0.55 or any two conflicting node outputs score within 5% of each other.

### Files to Create or Modify

- `convex/hiveEvaluator.ts` — create (`"use node"`: `evaluateDag` internalAction)
- `convex/hiveData.ts` — modify (add `_insertEvaluation`, `_insertEscalation`, `_setRootResult` mutations; `_setRootResult` patches a `tasks` row's `result` + `judge_verdict`)
- `lib/hive/evaluator-core.ts` — create (pure: `detectTies(scores, epsilon)` and `overallConfidence(evaluations)` helpers + the model response zod-free validator)
- `lib/hive/evaluator-core.test.ts` — create
- `package.json` — modify (append the test)

### Files to Leave Alone

- `convex/auctions.ts` — the per-node judge is separate and stays; the evaluator never edits auction code.
- `convex/agents.ts` — reuse `_applyReputationDelta`; do not change its signature.
- `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Create `lib/hive/evaluator-core.ts`: `detectTies(items: Array<{ node_id: string; score: number; conflicts_with?: string[] }>, epsilon = 0.05): Array<[string, string]>` — for each declared conflict pair, return it when `Math.abs(scoreA - scoreB) <= epsilon`. `overallConfidence(evaluations: Array<{ score: number; verdict: string }>): number` — mean score of accepted node evaluations, 0 when none. `parseEvaluatorResponse(raw: unknown): EvaluatorResult | { error: string }` — structural validation of the model output (below).
2. Test those in `lib/hive/evaluator-core.test.ts`; append to `package.json` test chain.
3. Create `convex/hiveData.ts` additions: `_insertEvaluation` (args = `hive_evaluations` row minus `_id`/`created_at`; stamps `created_at`), `_insertEscalation` (args = `escalations` row minus `_id`/`created_at`/`status`; sets `status: "open"`, `created_at`), `_setRootResult` (args `{ task_id: v.id("tasks"), result: v.any(), judge_verdict: v.any() }`; patches both fields).
4. Create `convex/hiveEvaluator.ts` (`"use node"`). `evaluateDag = internalAction({ args: { dag_id }, handler })`.
5. Load dag (`_getDag`), nodes (`_getNodes`), scratchpad (`internal.scratchpad._forDag`). Build the evaluator user prompt: original goal (`dag.goal`); for each node: `node_id`, `description`, `success_criteria`, `assigned_agent_id`, and `output_text` (truncate each to 6000 chars); plus a compact scratchpad digest (top 15 entries by confidence).
6. System prompt for `claude-fable-5`: role = chief evaluator of a multi-agent hive; for EACH node output a `{ node_id, agent_id, score (0..1 vs that node's success_criteria), verdict: "accept"|"reject", reasoning }`; identify `conflicts: [{ node_a, node_b, explanation }]` where two nodes produced contradictory or overlapping claims; produce a single `final_answer` (markdown) that synthesizes accepted node outputs into a cohesive response to the original goal, staying faithful to what agents actually produced (mirror the faithfulness rules in `convex/planning.ts` SYNTHESIZER_SYSTEM_PROMPT and the grounding rules in `JUDGE_GENERAL_PROMPT`); output JSON only.
7. Call `callClaudeJSON<EvaluatorResult>` with `CLAUDE_PLANNER_MODEL`, maxTokens 3000, timeoutMs 60_000, retries 1. On failure/parse-error: fall back — concatenate accepted node outputs as `final_answer`, assign every node `score: node.eval_score ?? 0.5, verdict: "accept"`, log `[hive-evaluator] fallback: <reason>`.
8. Persist one `hive_evaluations` row per node (`judge_model: CLAUDE_PLANNER_MODEL`, `conflicts_with` = node_ids it conflicts with) plus one whole-DAG row (`node_id: undefined`, `score: overallConfidence(...)`).
9. Reputation: for each node with an `assigned_agent_id`, `_applyReputationDelta` with `delta = verdict === "accept" ? 0.03 * score : -0.05`, `event_type: "hive_node_evaluated"`, `task_id: node.task_id ?? dag.root_task_id`, `increment_completed: verdict === "accept"`, `increment_disputes_lost: verdict === "reject"`; then `ctx.scheduler.runAfter(0, internal.hiveRegistry.refreshEmbedding, { agent_id })` so the registry's denormalized reputation snapshot tracks the change (dedupe agent_ids).
10. Escalation: compute `confidence = overallConfidence(evaluations)` and `ties = detectTies(nodeEvals, 0.05)`. If `confidence < 0.55` OR `ties.length > 0`: `_insertEscalation({ dag_id, task_id: dag.root_task_id, kind: ties.length ? "conflict_tie" : "low_confidence", reason, payload: { confidence, ties } })`, set DAG `"escalated"`, and STILL write the best-available `final_answer` to the root (humans refine, they are not blocked). Else set DAG `"complete"`.
11. Write the root result: `_setRootResult({ task_id: dag.root_task_id, result: { text: final_answer, agent_id: "hive-evaluator", provenance: { tier: "not-a2a-yet", live_tools_called: false, fallback_reason: "hive_synthesis" } }, judge_verdict: { verdict: confidence >= 0.55 ? "accept" : "reject", reasoning: <evaluator summary>, quality_score: confidence } })`. Set the root task status to `"complete"` (or `"disputed"` when escalated) via `internal.tasks._setStatus`.
12. Lifecycle log on the root task: `hive_evaluated` with `{ node_scores, confidence, ties, escalated }`.
13. Push with `npx convex dev --once`.

### New Types and Schemas

```typescript
// lib/hive/evaluator-core.ts
export interface NodeEvaluation {
  node_id: string;
  agent_id: string;
  score: number;     // 0..1
  verdict: "accept" | "reject";
  reasoning: string;
  conflicts_with?: string[];
}
export interface EvaluatorResult {
  node_evaluations: NodeEvaluation[];
  conflicts: Array<{ node_a: string; node_b: string; explanation: string }>;
  final_answer: string;
}
export function detectTies(
  items: Array<{ node_id: string; score: number; conflicts_with?: string[] }>,
  epsilon?: number,
): Array<[string, string]>;
export function overallConfidence(
  evaluations: Array<{ score: number; verdict: string }>,
): number;
export function parseEvaluatorResponse(raw: unknown): EvaluatorResult | { error: string };
```

API contract: `internal.hiveEvaluator.evaluateDag` (internalAction) args `{ dag_id }`.

### Success Criteria

- `npx tsx lib/hive/evaluator-core.test.ts` exits 0 (covers: 4%-apart conflicting scores flagged as tie, 6%-apart not; confidence mean ignores rejected nodes).
- `npx convex dev --once` pushes cleanly.
- On the dev deployment, after a DAG's nodes all settle, `evaluateDag` writes one `hive_evaluations` row per node + one summary row, sets the DAG `complete` or `escalated`, and the ROOT task's `result.text` contains a synthesized answer rendered by the existing `/task/[id]` page.
- A DAG engineered to produce two conflicting nodes with near-equal scores creates an `escalations` row with `kind: "conflict_tie"` and DAG status `escalated`.

### Notes

- The evaluator makes ONE fable call for the whole DAG (per spec); per-node judging already happened in each auction. Do not loop per node.
- The 5%-tie and 0.55-confidence thresholds are the spec's escalation triggers — keep them as named constants for tunability.
- Escalation never blocks delivery: write the best answer and flag it. Agent Task 17's dashboard surfaces open escalations.
- Reputation deltas here are SMALL and additive to the per-auction deltas already applied in `settle` — the hive evaluation is a second, DAG-level signal, intentionally lighter (0.03/0.05) than the auction's (0.05/0.10).

---

## Agent Task 16: Settlement accrual (Layer 6) — `convex/settlement.ts`

**Delegate to:** sonnet
**Parallelizable:** No
**Depends on:** Agent Task 3 (schema: `payout_records`)

### Context

Arbor settles each task in `convex/auctions.ts` `settle` (NOT modified here): on accept it releases escrow and applies a positive reputation delta; on reject it refunds and penalizes. Real money is optional (Stripe Connect when `ARBOR_PAYMENTS_MODE=stripe_checkout`; otherwise simulated Convex `escrow` rows). The platform fee basis points live in `ARBOR_PLATFORM_FEE_BPS` (default 1000 = 10%, see `.env.example` line 124). Per-agent live reputation is on `agents.reputation_score`; completed-task economics are on `tasks` (`price_paid`, `status`, `winning_bid_id`) and `reputation_dimensions` (per accepted task). Agent owners are not yet modeled as first-class entities — `discovered_specialists.owner_id` (added in Agent Task 3) and `agents.sponsor` are the attribution keys.

Layer 6 (near-term scope per spec): the platform tracks routing volume per external agent owner and writes a MONTHLY payout record; no on-chain settlement. Agent Task 3 created `payout_records`: `{ owner_id, agent_id, period ("YYYY-MM"), tasks_won, tasks_lost, tasks_accepted, gross_volume, platform_fee, estimated_payout, reputation_end, created_at, updated_at }` with indexes `by_owner_and_period`, `by_agent_and_period`. This task computes those records from settled tasks; it does not move money. It is a pure accrual/reporting layer that can be recomputed idempotently for any period.

### Goal

`convex/settlement.ts` exposing an internal action `accruePeriod({ period })` that scans settled tasks in the given `YYYY-MM` window, attributes each to the winning agent's owner, aggregates wins/losses/accepted counts and `gross_volume` (sum of `price_paid` on accepted tasks), computes `platform_fee = gross_volume * ARBOR_PLATFORM_FEE_BPS/10000` and `estimated_payout = gross_volume - platform_fee`, upserts one `payout_records` row per `(owner_id, agent_id, period)`, plus a public query `payoutsForOwner({ owner_id, period? })` and `payoutSummary({ period })` for the dashboard (Agent Task 17) and a thin REST surface (Agent Task 18).

### Files to Create or Modify

- `convex/settlement.ts` — create (default-runtime query helpers + an `internalAction` for accrual; split node vs non-node correctly — accrual reads many rows, so do the heavy read in an `internalQuery` and the orchestration in the action)
- `convex/settlementData.ts` — create (default runtime: `_settledTasksInPeriod` internalQuery, `_upsertPayout` internalMutation, `_ownerForAgent` internalQuery resolving `discovered_specialists.owner_id ?? agents.sponsor`)
- `lib/hive/settlement-core.ts` — create (pure: `periodOf(timestampMs)` → "YYYY-MM", `periodBounds(period)` → `{ startMs, endMs }`, `computePayout(rows, feeBps)` aggregator)
- `lib/hive/settlement-core.test.ts` — create
- `package.json` — modify (append the test)

### Files to Leave Alone

- `convex/auctions.ts` — settlement of individual tasks is untouched; this layer reads results after the fact.
- `convex/escrow.ts`, the Stripe routes — money movement is out of scope for near-term Layer 6.
- `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. Create `lib/hive/settlement-core.ts`: `periodOf(ms: number): string` (UTC `YYYY-MM`); `periodBounds(period: string): { startMs: number; endMs: number }` (first ms of the month to first ms of next month, UTC); `computePayout(rows: SettledRow[], feeBps: number): OwnerAgentAccrual[]` grouping by `(owner_id, agent_id)` and summing — `tasks_won` = count where the agent had the winning bid, `tasks_accepted` = subset with `status === "complete"`, `tasks_lost` = count where agent bid but lost is NOT computed here (we only have winner rows from the query) so define `tasks_lost` as accepted-vs-disputed: tasks won but `status === "disputed"`. Document this precisely in a comment.
2. Test `periodOf`/`periodBounds`/`computePayout` in `lib/hive/settlement-core.test.ts`; append to `package.json`.
3. Create `convex/settlementData.ts`: `_settledTasksInPeriod` internalQuery `{ start_ms, end_ms }` — query `tasks` and return only those with `winning_bid_id` set and `status` in `complete|disputed` and `_creationTime` within bounds (NOTE: there is no index on status+time; use a bounded `.collect()` with an in-handler filter is disallowed by guidelines — instead paginate or `.take(2000)` newest-first via the default `_creationTime` order, then filter in memory, and log if the cap is hit). For each, join the winning bid (`internal.bids._get`) to get `agent_id` and `price_paid` (from the task). `_ownerForAgent` internalQuery `{ agent_id }` → `discovered_specialists.owner_id` if present else `agents.sponsor` else the agent_id. `_upsertPayout` internalMutation upserting by `by_owner_and_period` + matching `agent_id`.
4. Create `convex/settlement.ts`: `accruePeriod = internalAction({ args: { period: v.string() }, handler })` — compute bounds, read settled rows via `_settledTasksInPeriod`, resolve each agent's owner via `_ownerForAgent`, run `computePayout`, read each agent's current `reputation_score` (`internal.agents._getByAgentId`) for `reputation_end`, `_upsertPayout` each accrual. Return `{ period, owners, agents, gross_volume }` summary.
5. Public queries in `convex/settlement.ts`: `payoutsForOwner` `{ owner_id: v.string(), period: v.optional(v.string()) }` (index `by_owner_and_period`) and `payoutSummary` `{ period: v.string() }` (returns all rows for the period; bounded `.take(1000)`).
6. Push with `npx convex dev --once`.

### New Types and Schemas

```typescript
// lib/hive/settlement-core.ts
export interface SettledRow {
  task_id: string;
  agent_id: string;
  owner_id: string;
  status: "complete" | "disputed";
  price_paid: number;
}
export interface OwnerAgentAccrual {
  owner_id: string;
  agent_id: string;
  tasks_won: number;
  tasks_accepted: number;
  tasks_lost: number;
  gross_volume: number;
  platform_fee: number;
  estimated_payout: number;
}
export function periodOf(ms: number): string;
export function periodBounds(period: string): { startMs: number; endMs: number };
export function computePayout(rows: SettledRow[], feeBps: number): OwnerAgentAccrual[];
```

API contract: `internal.settlement.accruePeriod` (internalAction) `{ period }`; `api.settlement.payoutsForOwner`, `api.settlement.payoutSummary`.

### Success Criteria

- `npx tsx lib/hive/settlement-core.test.ts` exits 0 (10% fee on $10 gross → $1 fee, $9 payout; period math handles December→January rollover UTC).
- `npx convex dev --once` pushes cleanly.
- After running several auctions to completion: `npx convex run settlement:accruePeriod '{"period":"2026-06"}'` returns a summary with `gross_volume > 0` and `payout_records` rows exist; `npx convex run settlement:payoutSummary '{"period":"2026-06"}'` lists them.
- Re-running `accruePeriod` for the same period does not duplicate rows (upsert verified).

### Notes

- `ARBOR_PLATFORM_FEE_BPS` is read with a default of 1000; parse via `Number(process.env.ARBOR_PLATFORM_FEE_BPS ?? "1000")` guarded for NaN.
- This is accrual only — no Stripe transfer is initiated; that is explicitly out of near-term scope per the product spec ("No on-chain settlement yet").
- `tasks_lost` is approximate without a full per-agent bid history scan; the comment in `computePayout` must state the definition so the dashboard label matches.

---

## Agent Task 17: Owner dashboard data + page (`/dashboard` hive section)

**Delegate to:** sonnet
**Parallelizable:** No
**Depends on:** Agent Task 16 (settlement queries), Agent Task 15 (evaluations/escalations exist)

### Context

Arbor's frontend is Next.js 15 App Router with a Convex React client; pages live under `app/` and an existing owner-facing page is `app/dashboard/page.tsx`. Convex data is read in client components via `useQuery(api.module.fn, args)` from `convex/react` (the provider is wired in `app/providers.tsx`). Existing reputation visualization components exist: `components/agents/ReputationChart.tsx` and `components/agents/SpecialistCard.tsx` (recharts is a dependency). The hive layers produced new queryable data: `api.settlement.payoutsForOwner` / `api.settlement.payoutSummary` (Agent Task 16; tasks won/lost/accepted, gross volume, estimated payout, reputation_end per agent per period), `hive_evaluations` and `escalations` tables (Agent Task 15). The product spec for Layer 6: agent owners see a dashboard of tasks won, tasks lost, reputation trend, and estimated payout.

The plan's rule is "No new frontend pages unless a task explicitly requires one" — this task explicitly requires dashboard surfacing, implemented as a SECTION added to the existing `app/dashboard/page.tsx` (not a new route). It also needs two small public Convex read queries for open escalations so an operator can see what needs human review.

### Goal

The existing `app/dashboard/page.tsx` gains a "Hive payouts" section rendering the current period's `payout_records` for the signed-in owner (tasks won / lost / accepted, gross volume, estimated payout, reputation_end) as a table plus a reputation-trend sparkline reusing `ReputationChart`, and a compact "Needs review" panel listing open `escalations`, backed by a new public Convex query `api.escalations.listOpen` and a `period` defaulting to the current `YYYY-MM`.

### Files to Create or Modify

- `convex/escalations.ts` — create (public queries: `listOpen` `{ limit?: number }` via index `by_status`, `forTask` `{ task_id }`)
- `components/dashboard/HivePayouts.tsx` — create (client component; `useQuery` payouts + escalations)
- `app/dashboard/page.tsx` — modify (import and render `<HivePayouts />` in a new section)
- `lib/hive/settlement-core.ts` — modify only if `periodOf` needs a `Date.now()`-based `currentPeriod()` convenience export; add `export function currentPeriod(now: number): string { return periodOf(now); }` (keep it pure — caller passes `Date.now()`)

### Files to Leave Alone

- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- `components/agents/ReputationChart.tsx` — reuse as-is; do not modify its props.
- `app/providers.tsx` — Convex provider already configured.

### Implementation Steps

1. Create `convex/escalations.ts` with `listOpen` (query, args `{ limit: v.optional(v.number()) }`, `withIndex("by_status", q => q.eq("status","open"))`, `.order("desc")`, `.take(limit ?? 25)`) and `forTask` (query, args `{ task_id: v.id("tasks") }`, index `by_task`).
2. Create `components/dashboard/HivePayouts.tsx` (`"use client"`). Resolve the owner id the same way the rest of the dashboard does (inspect `app/dashboard/page.tsx` for the existing identity source — Clerk user / `posted_by` convention; reuse it, do not invent a new one). Compute `period` with `currentPeriod(Date.now())`.
3. `const payouts = useQuery(api.settlement.payoutsForOwner, { owner_id, period });` Render a table: columns Agent, Won, Accepted, Lost, Gross ($), Est. Payout ($), Reputation. Handle `undefined` (loading) and empty states with concrete copy ("No settled tasks this period yet.").
4. Reputation trend: for the owner's top agent by gross volume, render `<ReputationChart agentId={...} />` if its props accept an agent id (inspect the component; if it needs event data, pass `useQuery(api.reputation.history, { agent_id })` per its existing contract — match exactly what `app/agents/page.tsx` does).
5. `const escalations = useQuery(api.escalations.listOpen, { limit: 10 });` Render a "Needs review" list: each row shows `kind`, `reason`, the linked task id as a link to `/task/<id>`, and `created_at`. Empty state "Nothing awaiting review."
6. In `app/dashboard/page.tsx`, add a section heading "Hive" and render `<HivePayouts />`. Match the page's existing layout primitives (Card components in `components/ui/`).
7. `npm run typecheck`; `npm run dev` and visually confirm the section renders (the in-app Browser plugin per CLAUDE.md).

### New Types and Schemas

No new tables. New public queries: `api.escalations.listOpen`, `api.escalations.forTask`. New pure helper `currentPeriod(now: number): string`.

### Success Criteria

- `npm run typecheck` passes.
- `npm run dev` → `/dashboard` shows the Hive section; with `payout_records` present (from Agent Task 16's accrual) the table is populated; with open escalations present the review panel lists them with working `/task/<id>` links.
- No new top-level route is added (the change is within `app/dashboard/page.tsx`).

### Notes

- Reuse the dashboard's existing owner-identity mechanism verbatim — do not introduce a new auth or id convention.
- `payout_records` only exist after `accruePeriod` runs (Agent Task 18 schedules it); the empty state must read as "not yet computed", not an error.
- Keep copy concrete and product-facing per CLAUDE.md; no onboarding filler.

---

## Agent Task 18: Settlement REST + monthly accrual scheduling

**Delegate to:** qwen
**Parallelizable:** No
**Depends on:** Agent Task 16 (settlement)

### Context

Arbor schedules background work two ways: Convex crons (`convex/crons.ts` if present — it is NOT in this repo yet; create it following `convex/_generated/ai/guidelines.md` cron rules: only `crons.interval` or `crons.cron`, pass a `FunctionReference`, export the `crons` object as default) and the per-task scheduler in actions. Agent Task 16 created `internal.settlement.accruePeriod({ period })` (idempotent monthly accrual) and public queries `api.settlement.payoutsForOwner` / `api.settlement.payoutSummary`. The REST surface convention is in `app/api/v1/*` (thin wrappers, `jsonOk`/`jsonError`/`corsPreflight` from `lib/http.ts`, `runtime = "nodejs"`). `lib/hive/settlement-core.ts` has `periodOf` / `currentPeriod`.

The product spec (Layer 6) wants owners to see payouts; this task makes the accrual run automatically (monthly, and a daily refresh of the current period so the dashboard is never more than a day stale) and exposes payouts over plain HTTP for agent owners who do not use the dashboard. Convex cron schedules are in UTC.

### Goal

A `convex/crons.ts` that runs `internal.settlement.accruePeriod` daily for the current period (rolling refresh) and once at month start for the just-ended period, plus a REST endpoint `GET /api/v1/payouts?owner_id=...&period=...` returning that owner's payout records (defaulting to the current period), wired through the existing v1 conventions and advertised in the v1 index.

### Files to Create or Modify

- `convex/crons.ts` — create (daily current-period accrual + monthly prior-period accrual)
- `convex/settlement.ts` — modify ONLY if a tiny wrapper is needed for the cron to call accrual with a computed period; prefer adding `accrueCurrentAndPrevious` internalAction here that computes both periods from `Date.now()` and calls `accruePeriod` twice (keeps `crons.ts` argument-free, which the guidelines favor)
- `app/api/v1/payouts/route.ts` — create
- `app/api/v1/route.ts` — modify (advertise `GET /api/v1/payouts`)

### Files to Leave Alone

- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- `lib/hive/settlement-core.ts` aggregation logic — reuse `currentPeriod`; do not change `computePayout`.

### Implementation Steps

1. In `convex/settlement.ts`, add `accrueCurrentAndPrevious = internalAction({ args: {}, handler })`: compute `now = Date.now()`, `current = currentPeriod(now)`, and `previous` = the prior month's `YYYY-MM` (derive from `periodBounds(current).startMs - 1`); call `accruePeriod` for both via `ctx.runAction(internal.settlement.accruePeriod, { period })`.
2. Create `convex/crons.ts`: `import { cronJobs } from "convex/server"; import { internal } from "./_generated/api";` declare `const crons = cronJobs();` then `crons.interval("hive payout accrual", { hours: 24 }, internal.settlement.accrueCurrentAndPrevious, {});` and `export default crons;`. (A 24h interval covers both the daily refresh and month-boundary catch-up since `accrueCurrentAndPrevious` always accrues the previous period too — simpler and guideline-compliant versus a monthly `crons.cron`.)
3. Create `app/api/v1/payouts/route.ts`: `GET` reads `owner_id` (required, 400 if missing) and `period` (optional; default via `currentPeriod(Date.now())`); call `convex().query(api.settlement.payoutsForOwner, { owner_id, period })`; respond `jsonOk({ owner_id, period, payouts })`. Export `OPTIONS` → `corsPreflight()`, `runtime="nodejs"`, `dynamic="force-dynamic"`.
4. Update `app/api/v1/route.ts` `endpoints` map: `"GET /api/v1/payouts?owner_id=": "Monthly payout accrual for an agent owner (tasks won/lost/accepted, gross volume, estimated payout)."`.
5. `npx convex dev --once` (registers the cron); `npm run typecheck`.

### New Types and Schemas

None — consumes existing settlement queries.

### Success Criteria

- `npx convex dev --once` pushes and the cron appears in the Convex dashboard's Schedules/Crons view as "hive payout accrual".
- `npx convex run settlement:accrueCurrentAndPrevious '{}'` returns without error and populates `payout_records` for the current month.
- `curl -s 'localhost:3000/api/v1/payouts?owner_id=<sponsor>'` returns that owner's payouts for the current period.
- `curl -s localhost:3000/api/v1` lists the payouts endpoint.

### Notes

- Guidelines forbid `crons.daily/weekly` helpers — use `crons.interval` as specified.
- The accrual is idempotent (upsert), so a daily re-run that overlaps a monthly boundary cannot double-count.
- No money moves; this is reporting only (near-term Layer 6 scope).


---

## Agent Task 19: Wire the hive path into task posting + settle dispatch

**Delegate to:** opus
**Parallelizable:** No
**Depends on:** Agent Task 9 (planner), Agent Task 10 (orchestrator), Agent Task 11 (router), Agent Task 12 (auction extension), Agent Task 13 (scratchpad)

### Context

This task connects the hive engine to Arbor's live entry points. Today, `convex/tasks.ts` `post` (the public mutation backing the UI, MCP `post_task`, REST `POST /api/v1/tasks`, and the A2A market gateway) always schedules `internal.planning.decompose` (the legacy SEQUENTIAL planner), except for conversion-drop prompts which go to `internal.demos.runConversionDropDemo`. The hive planner is `internal.hivePlanner.planDag` (Agent Task 9), which builds a DAG and (via the orchestrator) routes nodes in parallel through the EXISTING Vickrey auction. Node child tasks created by `internal.hiveRouter.routeNode` (Agent Task 11) carry `hive_node_id` and `parent_task_id` (the DAG root). When such a child's auction finishes, `convex/auctions.ts` `settle` already calls `internal.planning.advanceOrSynthesize` for any task with `parent_task_id` set — but that legacy function assumes the LEGACY `task_plan` sequential model and would mis-handle hive children. The hive needs `settle`-completion of a hive child to instead notify `internal.hiveOrchestrator.onNodeSettled` (Agent Task 10).

Per the no-touch rule, `convex/auctions.ts` may only be edited by Agent Task 12 — so the settle dispatch CANNOT be added inside `settle`. Instead, the dispatch is added inside `internal.planning.advanceOrSynthesize` (in `convex/planning.ts`, which IS editable): at its top, if the just-settled child task has `hive_node_id` set, route to `internal.hiveOrchestrator.onNodeSettled` and return, leaving the entire legacy sequential path untouched for non-hive children. Hive vs legacy selection at post time is controlled by an opt-in: a `workflow_mode: "hive"` hint on the task (column `tasks.workflow_mode` already exists) or an env flag `ARBOR_HIVE_DEFAULT=true`, so the default product behavior is unchanged unless explicitly enabled.

### Goal

Task posting routes to the hive planner when hive mode is requested (explicit `workflow_mode: "hive"` argument or `ARBOR_HIVE_DEFAULT=true`) while defaulting to the legacy planner otherwise, and `internal.planning.advanceOrSynthesize` dispatches hive child completions to `internal.hiveOrchestrator.onNodeSettled` instead of the legacy sequential advance — making a hive task run end to end (post → DAG plan → parallel node auctions → scratchpad sharing → DAG evaluation → root result) entirely through existing surfaces with zero change to `convex/auctions.ts` beyond Agent Task 12.

### Files to Create or Modify

- `convex/tasks.ts` — modify (`post`: accept/forward a hive routing decision; schedule `internal.hivePlanner.planDag` instead of `internal.planning.decompose` when hive mode is on)
- `convex/planning.ts` — modify (`advanceOrSynthesize`: early hive dispatch guard)
- `lib/mcp-tools.ts` — modify (`PostTaskArgs` + `handlePostTask` + the `post_task` tool schema gain optional `workflow_mode`)
- `app/api/v1/tasks/route.ts` — modify (pass through optional `workflow_mode`)
- `.env.example` — modify (document `ARBOR_HIVE_DEFAULT`)

### Files to Leave Alone

- `convex/auctions.ts` — settle stays exactly as Agent Task 12 left it; the dispatch lives in `planning.ts`.
- `convex/hivePlanner.ts`, `convex/hiveOrchestrator.ts`, `convex/hiveRouter.ts` — consumed via scheduler references; no edits.
- `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.

### Implementation Steps

1. In `convex/tasks.ts` `post`, add an optional arg `workflow_mode: v.optional(v.string())`. Compute `const hive = args.workflow_mode === "hive" || (process.env.ARBOR_HIVE_DEFAULT === "true" && args.workflow_mode !== "legacy");`. Persist `workflow_mode: hive ? "hive" : undefined` on the inserted task row (column exists).
2. Replace the scheduling tail: keep the conversion-drop branch first; then `if (hive) { await ctx.scheduler.runAfter(0, internal.hivePlanner.planDag, { task_id }); } else { await ctx.scheduler.runAfter(0, internal.planning.decompose, { task_id }); }`. Do not change the returned shape.
3. In `convex/planning.ts` `advanceOrSynthesize`, at the very top after loading `child` (it already reads the child task), add: `if (child.hive_node_id) { await ctx.scheduler.runAfter(0, internal.hiveOrchestrator.onNodeSettled, { task_id: args.task_id }); return; }`. This is the ONLY hive edit in this file; the legacy path below is untouched.
4. In `lib/mcp-tools.ts`: add `workflow_mode?: string` to `PostTaskArgs`; pass it through in `handlePostTask` to `api.tasks.post`; add a `workflow_mode` property to the `post_task` tool `inputSchema.properties` with description "Optional. Set to 'hive' to run the multi-agent DAG hive planner (parallel nodes + shared scratchpad + DAG evaluation). Omit for the standard sequential planner."
5. In `app/api/v1/tasks/route.ts`, include `workflow_mode` when forwarding the body to `handlePostTask` (it already spreads typed fields — add the field to the whitelist).
6. Document `ARBOR_HIVE_DEFAULT=` in `.env.example` (default false; note it must be set on BOTH Next and the Convex deployment because `post` runs in Convex).
7. `npx convex dev --once`; `npm run typecheck`.

### New Types and Schemas

No new tables. `PostTaskArgs` gains `workflow_mode?: string`. `tasks.post` gains arg `workflow_mode?: string`. New env var `ARBOR_HIVE_DEFAULT`.

### Success Criteria

- A legacy task (`post_task` without `workflow_mode`) still runs the sequential planner — verify the `plan_decided` lifecycle event (legacy) appears, NOT `hive_plan_decided`.
- A hive task: `curl -s -X POST localhost:3000/api/v1/tasks -H 'content-type: application/json' -d '{"prompt":"Research the three leading open agent registries, then write a one-paragraph comparison.","max_budget":4,"workflow_mode":"hive"}'` produces a `hive_dags` row, `hive_plan_decided` + `hive_node_routed` + `hive_node_settled` + `hive_evaluated` lifecycle events on the root task, and a synthesized `result.text` on the root task within a few minutes.
- `git diff convex/auctions.ts` shows ONLY the Agent Task 12 hunk (this task added nothing to it).
- `npx convex dev --once` pushes; `npm run typecheck` passes.

### Notes

- The hive path reuses the auction wholesale: each node is a child task that flows solicitBids → resolve → execute → judge → settle, then `advanceOrSynthesize` redirects to the orchestrator. This is why no `auctions.ts` edit is needed here.
- `ARBOR_HIVE_DEFAULT` must be set on the Convex deployment (`npx convex env set ARBOR_HIVE_DEFAULT true`) to affect server-side `post`, not just `.env.local`.
- Children created by the hive router set `parent_task_id` (DAG root); the legacy `advanceOrSynthesize` would otherwise synthesize the root prematurely — the early guard prevents that. This is the single most important correctness line in the whole hive wiring.

---

## Agent Task 20: REST + MCP access to the shared scratchpad

**Delegate to:** sonnet
**Parallelizable:** No
**Depends on:** Agent Task 13 (scratchpad backend), Agent Task 9 (hiveData for dag lookup)

### Context

Layer 4's stigmergy model only works if external agents — not just Arbor's own runners — can read and write the shared scratchpad. Agent Task 13 built the Convex backend: `api.scratchpadActions.write` (validated external write: dag_id, agent_id, kind, content, confidence → returns entry_id, schedules embedding), `api.scratchpadActions.semanticRecall` (dag_id + query → scored entries), and `api.scratchpad.forDag` (all entries for a dag, embeddings stripped). The hive exposes DAGs created from tasks; an external agent that won a node auction knows its `task_id` and can find the `dag_id` via the node (Agent Task 9's `convex/hiveData.ts` `_getNodeByTaskId`) — but external callers need a public lookup. Arbor's external surfaces are REST (`app/api/v1/*`, thin wrappers over `lib/mcp-tools.ts` handlers using `jsonOk`/`jsonError`/`corsPreflight`) and MCP (`lib/mcp-tools.ts` `TOOLS` + `dispatchTool`, also used by the A2A market gateway).

This task gives external agents three operations over both REST and MCP: read a dag's scratchpad, write an entry, and semantic-recall — plus a public query to resolve a `task_id` to its `dag_id` so an agent executing a node can find the shared store. The Vickrey/MCP-forwarding/A2A-forwarding cores are untouched; this is pure surface area over the Agent Task 13 backend.

### Goal

Three new MCP tools (`scratchpad_read`, `scratchpad_write`, `scratchpad_recall`) wired into `lib/mcp-tools.ts` (`TOOLS` + handlers + `dispatchTool`), the matching REST endpoints under `app/api/v1/scratchpad/*`, and a public Convex query `api.hiveData.dagForTask` resolving a `task_id` to its `dag_id`/`node_id`, so any external agent can participate in the stigmergy store using only a `task_id` it already owns.

### Files to Create or Modify

- `convex/hiveData.ts` — modify (add public query `dagForTask` `{ task_id }` → `{ dag_id, node_id } | null` via `_getNodeByTaskId`)
- `lib/mcp-tools.ts` — modify (3 arg interfaces, 3 `TOOLS` entries, 3 handlers, 3 `dispatchTool` cases)
- `app/api/v1/scratchpad/[dagId]/route.ts` — create (GET = read all; POST = write)
- `app/api/v1/scratchpad/[dagId]/recall/route.ts` — create (GET with `?q=`)
- `app/api/v1/route.ts` — modify (advertise the scratchpad endpoints)

### Files to Leave Alone

- `convex/scratchpad.ts` / `convex/scratchpadActions.ts` — backend is complete; only call it.
- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- `lib/specialists/a2a-market-card.ts` — do not add scratchpad intents to the A2A gateway (keep it stable).

### Implementation Steps

1. In `convex/hiveData.ts`, add `dagForTask` public query `{ task_id: v.id("tasks") }`: look up the node via `_getNodeByTaskId` logic (index `by_task_id`); return `{ dag_id, node_id }` or `null`.
2. In `lib/mcp-tools.ts`, add interfaces `ScratchpadReadArgs { dag_id: string }`, `ScratchpadWriteArgs { dag_id: string; agent_id: string; kind: "observation"|"result"|"decision"|"question"; content: string; confidence: number; node_id?: string; task_id?: string }`, `ScratchpadRecallArgs { dag_id: string; query: string; limit?: number }`.
3. Add `TOOLS` entries: `scratchpad_read` ("Read all shared-scratchpad entries for a hive DAG. Use the dag_id from your node task, or resolve it from your task_id via the task surface."), `scratchpad_write` ("Append an entry to a hive DAG's shared scratchpad. Stamp it with your agent_id, a kind, and a confidence 0..1. Other agents read this — be concise and honest about confidence."), `scratchpad_recall` ("Semantic search the shared scratchpad of a hive DAG for entries relevant to a query."). Required fields per the interfaces.
4. Implement handlers calling `convex().query(api.scratchpad.forDag, ...)`, `convex().action(api.scratchpadActions.write, ...)`, `convex().action(api.scratchpadActions.semanticRecall, ...)` respectively; validate confidence ∈ [0,1] and clamp `limit` 1..20.
5. Add the three `dispatchTool` cases.
6. Create `app/api/v1/scratchpad/[dagId]/route.ts`: `GET` → `forDag`; `POST` → parse body, require `agent_id`/`kind`/`content`/`confidence`, call `scratchpadActions.write` with `dag_id` from the path param. `[dagId]` arrives as a string; cast to `Id<"hive_dags">` at the boundary like `handleGetTask` does for task ids in `lib/mcp-tools.ts`.
7. Create `app/api/v1/scratchpad/[dagId]/recall/route.ts`: `GET` reads `?q=` (400 if missing) and `?limit=`, calls `semanticRecall`.
8. All routes: `runtime="nodejs"`, `dynamic="force-dynamic"`, `OPTIONS` → `corsPreflight()`.
9. Advertise in `app/api/v1/route.ts`: `"GET/POST /api/v1/scratchpad/:dagId"` and `"GET /api/v1/scratchpad/:dagId/recall?q="`.
10. `npm run typecheck`; `npx convex dev --once`.

### New Types and Schemas

```typescript
// lib/mcp-tools.ts
export interface ScratchpadReadArgs { dag_id: string; }
export interface ScratchpadWriteArgs {
  dag_id: string; agent_id: string;
  kind: "observation" | "result" | "decision" | "question";
  content: string; confidence: number;
  node_id?: string; task_id?: string;
}
export interface ScratchpadRecallArgs { dag_id: string; query: string; limit?: number; }
```
New public query `api.hiveData.dagForTask` `{ task_id }` → `{ dag_id, node_id } | null`.

### Success Criteria

- `npm run typecheck` passes; `npx convex dev --once` pushes.
- `curl -s -X POST localhost:3000/api/v1/scratchpad/<dagId> -H 'content-type: application/json' -d '{"agent_id":"ext-agent","kind":"observation","content":"Registry X requires an API key.","confidence":0.8}'` returns an entry id; `curl -s localhost:3000/api/v1/scratchpad/<dagId>` then includes it.
- `curl -s 'localhost:3000/api/v1/scratchpad/<dagId>/recall?q=api%20key'` returns that entry with a score.
- MCP `tools/list` includes the three scratchpad tools; a `scratchpad_write` call succeeds.

### Notes

- No auth in v1, consistent with the rest of the surface; a malicious writer could pollute a scratchpad, but the evaluator weighs entries by confidence and the auction still gates execution — note this as a known v1 limitation in the route comment.
- `dagForTask` lets an executing external agent bootstrap from the `task_id` it received in its A2A/MCP task; document this flow in the `scratchpad_read` tool description.
- Embeddings are written asynchronously by the backend — `recall` immediately after `write` may miss the just-written entry until embedding completes; document that the read endpoint is the immediate-consistency path.

---

## Agent Task 21: End-to-end hive integration test (`scripts/hive-e2e.ts`)

**Delegate to:** opus
**Parallelizable:** No
**Depends on:** Agent Tasks 4, 5, 8, 9, 10, 11, 12, 13, 15, 19 (the full hive path)

### Context

Arbor's existing test surface is `npm test` — a `tsx` chain of standalone scripts that assert and `process.exit(1)` on failure (e.g. `lib/intake-normalize.test.ts`). There is also a router benchmark harness in `eval/router-bench/` (run.ts/score.ts) and a live E2E probe in `eval/router-bench/live-e2e.ts`. The hive path spans Convex actions that run asynchronously via the scheduler (planner → orchestrator → per-node auctions with a 30s `BID_WINDOW_SECONDS` each → evaluator), so an end-to-end check must POST a hive task and POLL until the root task reaches a terminal state, then assert the hive artifacts exist. Convex is reached from scripts with `ConvexHttpClient` (`convex/browser`) using `NEXT_PUBLIC_CONVEX_URL`; the public read queries available include `api.tasks.get`, `api.lifecycle.forTask`, `api.scratchpad.forDag`, `api.escalations.forTask`, and the hive root result lands on `tasks.result` (Agent Task 15).

This is the self-verifying loop the project needs: one command that proves a multi-node hive task actually decomposes, routes nodes through the real Vickrey auction, shares state, evaluates, and synthesizes — catching regressions in any layer. It must run against a live dev deployment with `ANTHROPIC_API_KEY` set on Convex; when that key or live agents are absent it should SKIP with a clear message rather than fail (the planner falls back to a single node and there may be no eval-passed agents, which is an environment gap, not a code bug).

### Goal

A runnable script `scripts/hive-e2e.ts` (`npm run hive:e2e`) that posts a compound hive task via `api.tasks.post` with `workflow_mode: "hive"`, polls the root task until terminal (`complete` | `disputed` | `failed`, ~6 min cap), and asserts: a `hive_dags` row exists for the root with ≥1 node, the lifecycle contains `hive_plan_decided` and at least one `hive_node_routed` and `hive_node_settled`, the scratchpad has ≥1 entry, an `hive_evaluated` event fired, and the root task `result.text` is non-empty — printing a per-assertion PASS/FAIL report and exiting non-zero on any failure, while SKIPPING cleanly (exit 0 with a SKIP banner) when the deployment has no eval-passed agents or no Anthropic key.

### Files to Create or Modify

- `scripts/hive-e2e.ts` — create
- `convex/hiveData.ts` — modify only if a public `dagForRootTask` query is needed (add `{ task_id }` → the `hive_dags` row via index `by_root_task`); reuse if an equivalent already exists
- `package.json` — modify (add `"hive:e2e": "tsx scripts/hive-e2e.ts"`)

### Files to Leave Alone

- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- The `npm test` chain — keep this OUT of `npm test` (it needs a live deployment + key); it is a separate `npm run hive:e2e`.

### Implementation Steps

1. Add `dagForRootTask` public query to `convex/hiveData.ts` (`{ task_id: v.id("tasks") }`, index `by_root_task`, return the dag row or null).
2. Create `scripts/hive-e2e.ts`. Resolve `NEXT_PUBLIC_CONVEX_URL` (env or parse `.env.local`, like Agent Task 8's script). Build a `ConvexHttpClient`.
3. Preflight SKIP check: `api.hiveRegistry.searchAgents({ query: "research and summarize", include_unevaluated: false })`; if it returns 0 candidates, print `SKIP: no eval-passed agents registered (run npm run hive:backfill and ensure live endpoints + ANTHROPIC_API_KEY on Convex)` and exit 0.
4. Post the task: `api.tasks.post({ posted_by: "hive-e2e", prompt: "Identify two well-known open agent-interoperability protocols, then write a short paragraph contrasting them.", max_budget: 4, workflow_mode: "hive" })`; capture `task_id`.
5. Poll `api.tasks.get({ task_id })` every 5s up to 72 times (6 min). Stop when `status ∈ {complete, disputed, failed}`.
6. Gather artifacts: `api.lifecycle.forTask`, `dagForRootTask`, `api.scratchpad.forDag` (using the dag id), `api.escalations.forTask`.
7. Assertions (each prints `[PASS]`/`[FAIL] <reason>`): dag exists with ≥1 node (use `api.hiveData` node count query — add `nodeCountForDag` if needed, or read via an existing query); lifecycle includes `hive_plan_decided`; ≥1 `hive_node_routed`; ≥1 `hive_node_settled`; `hive_evaluated` present; scratchpad length ≥1; `task.result?.text` non-empty. Final status `failed` is a FAIL unless every node legitimately failed (then print diagnostic and FAIL — a fully-failed hive run is a real problem to surface).
8. Print a summary line `hive-e2e: X/Y assertions passed (status=<final>)`; `process.exit(passed === total ? 0 : 1)`.
9. Add the npm script.

### New Types and Schemas

Possibly `api.hiveData.dagForRootTask` `{ task_id }` → dag row | null, and an optional `api.hiveData.nodeCountForDag` `{ dag_id }` → number (only if no existing query returns node counts).

### Success Criteria

- `npm run typecheck` passes.
- Against a dev deployment WITHOUT eval-passed agents: `npm run hive:e2e` prints the SKIP banner and exits 0.
- Against a fully configured dev deployment (Anthropic key on Convex, `npm run hive:backfill` run, ≥2 live agents passing the eval gate, app + Convex running, tunnels up): `npm run hive:e2e` reaches a terminal status and prints `7/7 assertions passed`, exit 0.
- A deliberately broken layer (e.g. orchestrator not advancing) makes the corresponding assertion FAIL with a clear reason and non-zero exit.

### Notes

- 6-minute cap: a 2-3 node DAG with 30s windows plus model latency fits; deeper DAGs need a higher cap — keep it configurable via an env var `HIVE_E2E_TIMEOUT_MS`.
- SKIP, do not FAIL, on environment gaps (no key, no agents): those are deployment conditions, and a red E2E for a missing key trains people to ignore it.
- This is the project's recurring verification command — pair it with the `/verify`-style skill the team already uses; document running it after any hive-layer change.

---

## Agent Task 22: Hive documentation + env + API-key reference

**Delegate to:** qwen
**Parallelizable:** No
**Depends on:** Agent Tasks 1-21 (documents what they built)

### Context

Per the repo's CLAUDE.md (root), "When adding code that requires a new API key or provider secret, update `docs/api-keys.md` in the same change. Never include real secret values." The hive layers introduced new secrets and env vars: `ANTHROPIC_API_KEY` (Agent Task 1; needed on BOTH Next and the Convex deployment), the embeddings backend reuses `OPENAI_API_KEY` plus `HIVE_EMBEDDINGS_FORCE_LOCAL` (Agent Task 2), and `ARBOR_HIVE_DEFAULT` (Agent Task 19). New developer commands were added: `npm run hive:backfill` (Agent Task 8), `npm run hive:e2e` (Agent Task 21). The existing `docs/agent-quickstart.md` documents how external agents use Arbor over MCP/REST/A2A; the hive added `register_agent`/`search_agents`/`scratchpad_*` MCP tools and `/api/v1/agents/*`, `/api/v1/payouts`, `/api/v1/scratchpad/*` REST endpoints. The global user instruction is to keep docs extremely concise, example-first, no emojis, and to NOT create `.md` files unless explicitly instructed — this task IS the explicit instruction to create `docs/api-keys.md` (if absent) and a hive section in the quickstart.

### Goal

Concise, example-first documentation: `docs/api-keys.md` lists every secret/env var the hive uses (name, where it is needed — Next and/or Convex — and a one-line purpose, never a value), `docs/agent-quickstart.md` gains a "Hive mode" section showing how an external agent registers, gets routed, reads/writes the scratchpad, and how an owner reads payouts (curl + MCP examples), and `.env.example` is confirmed to contain every new var (added by earlier tasks; this task audits and fills gaps).

### Files to Create or Modify

- `docs/api-keys.md` — create (or modify if it already exists)
- `docs/agent-quickstart.md` — modify (append a "Hive mode" section)
- `.env.example` — modify (audit; add any of `ANTHROPIC_API_KEY`, `HIVE_EMBEDDINGS_FORCE_LOCAL`, `ARBOR_HIVE_DEFAULT` missing from earlier tasks, each with a one-line comment)

### Files to Leave Alone

- `convex/auctions.ts`, `lib/specialists/mcp-forwarding.ts`, `lib/specialists/a2a-forwarding.ts` — hard no-touch constraints.
- Any source/runtime file — this task is docs + env only.
- `CLAUDE.md`, `AGENTS.md` — do not edit project instruction files.

### Implementation Steps

1. Create/update `docs/api-keys.md` with a table: columns Var | Where (Next / Convex / both) | Required? | Purpose. Rows: `ANTHROPIC_API_KEY` (both; required for hive planner+evaluator; `npx convex env set ANTHROPIC_API_KEY ...`), `OPENAI_API_KEY` (both; embeddings + legacy LLM; already documented — cross-reference), `HIVE_EMBEDDINGS_FORCE_LOCAL` (both; optional; forces deterministic offline embeddings for dev/CI), `ARBOR_HIVE_DEFAULT` (both; optional; routes all new tasks through the hive planner when true). Lead with a one-line warning: never commit real values; Convex env is separate from `.env.local`.
2. Append to `docs/agent-quickstart.md` a "## Hive mode" section, example-first: (a) register — `curl -X POST .../api/v1/agents/register -d '{...}'` and the `register_agent` MCP tool; (b) note the eval gate must pass before routing; (c) post a hive task — `curl -X POST .../api/v1/tasks -d '{"prompt":"...","max_budget":4,"workflow_mode":"hive"}'`; (d) participate in the scratchpad — resolve dag from task (`scratchpad_read`/`dagForTask`), `POST /api/v1/scratchpad/:dagId`, recall; (e) owner payouts — `GET /api/v1/payouts?owner_id=`. 1-2 sentences each, then the command.
3. Audit `.env.example`: grep for the three hive vars; add any missing with a single-line comment matching the file's existing style (see the Anthropic block from Agent Task 1).
4. Verify all referenced endpoints/tools/commands exist by grepping the codebase (`rg "register_agent" lib/mcp-tools.ts`, `rg "hive:backfill" package.json`, etc.) — every example in the docs must correspond to shipped code.

### New Types and Schemas

None.

### Success Criteria

- `docs/api-keys.md` exists and lists all four vars with no real values (verify with `rg -i "sk-|secret-value" docs/api-keys.md` returning nothing).
- `docs/agent-quickstart.md` has a "Hive mode" section whose every curl path and MCP tool name matches a shipped route/tool (spot-check 3 with `rg`).
- `.env.example` contains `ANTHROPIC_API_KEY`, `HIVE_EMBEDDINGS_FORCE_LOCAL`, and `ARBOR_HIVE_DEFAULT`.
- No source file changed; `git diff --stat` shows only docs + `.env.example`.

### Notes

- Keep it terse and example-first per the global doc style; engineers scan, they do not read.
- The single most common operational mistake this prevents: setting hive env vars only in `.env.local` and not on the Convex deployment, where `post`/planner/evaluator actually run. Call that out explicitly.
- No emojis anywhere.
