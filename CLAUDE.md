# CLAUDE.md — Arbor Agent Marketplace

Guidance for AI agents working in this repository. Read this before making any changes.

---

## What Arbor Is

**Arbor** is an agent-to-agent marketplace built for the Nozomio hackathon. A startup submits a product launch brief, the system filters a 100+ MCP specialist market down to the most relevant agents, those specialists bid in a **sealed-bid Vickrey (2nd-price) auction**, the winner produces the deliverable, and a judge verifies it before escrow settles and reputation updates. The canonical use case: launching a TikTok Shop creator campaign.

The primary interface is a **Next.js 15 App Router** application. The backend is **Convex** (real-time serverless DB + functions). Specialists connect via **MCP**, **A2A**, or in-process LLM personas.

**Live app**: `https://miyohacks.vercel.app`

---

## Repository Layout

```
miyohacks/
├── app/                       # Next.js 15 App Router — primary user-facing app
│   ├── page.tsx               # Landing: hero, task-posting form, scroll demo
│   ├── layout.tsx             # Root layout (Nunito font + providers)
│   ├── globals.css            # Brand HSL color tokens and semantic CSS variables
│   ├── providers.tsx          # ConvexClientProvider wrapper
│   ├── agents/page.tsx        # Browse specialists / leaderboard
│   ├── task/[id]/page.tsx     # Task detail: live auction, bids, verdict, settlement
│   ├── dashboard/page.tsx     # User dashboard
│   ├── present/page.tsx       # Presentation / demo slides
│   └── api/
│       ├── v1/tasks/          # REST: POST task, GET by ID, dispute, admin override
│       ├── v1/suggest/        # Score and rank MCP specialists for a goal
│       ├── v1/discover/       # Synthesize or find a new specialist
│       ├── v1/specialists/    # List known specialists
│       ├── a2a/market/        # Agent-to-Agent (A2A v0.3.0) gateway
│       ├── mcp/route.ts       # Streamable-HTTP MCP server (4 public tools)
│       ├── .well-known/mcp.json/        # MCP discovery manifest
│       ├── .well-known/ai-plugin.json/  # OpenAI plugin manifest
│       └── openapi.json/      # OpenAPI 3.1 schema export
├── components/
│   ├── ui/                    # Shadcn-style headless + custom (ArborMark, etc.)
│   ├── landing/               # Hero, orbital steps, scroll demo, footer
│   ├── agents/                # Agent cards, filtering, leaderboard
│   ├── task/                  # Task lifecycle, bid list, verdict, settlement panels
│   ├── present/               # Presentation-mode slides
│   ├── PostTaskForm.tsx       # Main task submission form
│   ├── AgentSuggestions.tsx
│   └── SpecialistLeaderboard.tsx
├── lib/
│   ├── specialists/           # 23 specialist definitions
│   │   ├── catalog.ts         # Curated HTTP MCP servers (Stripe, Notion, GitHub, v0…)
│   │   ├── mcp-forwarding.ts  # makeMcpForwardingSpecialist — proxies to remote MCP
│   │   ├── mcp-registry.ts    # Live query of registry.modelcontextprotocol.io
│   │   ├── discover.ts        # LLM synthesis fallback (labeled "synthesized")
│   │   ├── reacher-social.ts  # TikTok Shop creator/GMV lookup (primary sponsor ✓ MCP)
│   │   ├── nia-context.ts     # Campaign memory & brand context
│   │   ├── hyperspell-brain.ts # Brand persona synthesis
│   │   ├── devin-bridge.ts    # Devin AI integration
│   │   └── vercel-v0.ts       # Vercel v0 integration
│   ├── mcp-tools.ts           # MCP tool definitions + handlers
│   ├── mcp-outbound.ts        # Outbound MCP client (tool caching, 6-round exec loop)
│   ├── types.ts               # Specialist, Bid, Task, etc.
│   ├── intake-normalize.ts    # Task intake validation
│   ├── tool-call-audit.ts     # Tool call logging & auditing
│   ├── openai.ts              # OpenAI API wrapper
│   ├── suggest.ts             # Specialist ranking & discovery
│   └── registry.ts            # Specialist registry helpers
├── convex/                    # Serverless backend
│   ├── schema.ts              # DB schema (17 tables, 388 lines)
│   ├── auctions.ts            # Vickrey auction: bid window, winner selection
│   ├── tasks.ts               # Task CRUD and lifecycle transitions
│   ├── bids.ts                # Bid submission & scoring
│   ├── intake.ts              # Multi-turn intake conversation
│   ├── planning.ts            # Task decomposition into sub-steps
│   ├── demos.ts               # Demo task seeding
│   ├── contextEnrichment.ts   # Nia/Hyperspell context fetching
│   ├── agents.ts              # Agent registry management
│   ├── disputes.ts            # Dispute/appeal workflow
│   ├── reputation*.ts         # Reputation tracking (events + dimensions)
│   ├── seed.ts                # DB seeding (npx convex run seed:seedAgents)
│   └── _generated/ai/guidelines.md  # ← READ THIS before touching any Convex code
├── packages/                  # Monorepo workspaces (npm workspaces)
│   ├── sdk-core/              # Zero-dep TypeScript REST client (@agent-auction/sdk-core)
│   ├── cli/                   # `arbor` CLI binary (@agent-auction/cli)
│   ├── langchain/             # LangChain integration
│   ├── mastra/                # Mastra framework integration
│   └── vercel-ai/             # Vercel AI SDK integration
├── docs/
│   └── agent-quickstart.md   # External agent integration guide (A2A, MCP, REST)
├── examples/
│   ├── mcp-client.ts          # Standalone MCP client demo
│   └── provision-agent-key.ts # HMAC key provisioning for A2A
├── my-app/                    # ← SEPARATE Convex/React/Vite template. NOT the main app.
├── .env.example               # Source of truth for required env vars
├── next.config.ts
├── tailwind.config.ts
└── vercel.json
```

---

## Local Development

```bash
cp .env.example .env.local      # fill in keys
npm install
npm run convex:dev              # start Convex backend (watch mode)
npm run dev                     # start Next.js (default: http://localhost:3000)
```

If port 3000 is in use, Next.js prints the actual port — use that.

Other commands:

```bash
npm run build          # production build
npm run typecheck      # TypeScript check
npm test               # tsx lib/intake-normalize.test.ts && tsx lib/tool-call-audit.test.ts
npm run lint           # ESLint
npm run convex:once    # one-shot codegen / schema push (no watch)
npx convex run seed:seedAgents  # populate specialist roster
```

---

## Architecture

```
User / External Agent
        │
        ▼
Next.js App (app/)
  ├── REST API    →  /api/v1/tasks, /api/v1/suggest, /api/v1/discover
  ├── MCP server  →  /api/mcp        (streamable-HTTP, 4 tools)
  └── A2A gateway →  /api/a2a/market (A2A v0.3.0, 4 intents)
        │
        ▼
Convex Backend
  ├── Intake         multi-turn task conversation
  ├── Planning       decompose into ordered sub-steps
  ├── Auction        bid window → collect bids → Vickrey winner
  ├── Execution      winner runs with MCP tools (up to 6 rounds)
  ├── Judging        LLM judge evaluates delivery quality
  └── Settlement     escrow release, reputation delta, lifecycle close
        │
        ▼
Specialist Agents  (lib/specialists/)
  Tier 1 ─ Curated HTTP MCP servers (Stripe, Notion, GitHub, Linear, v0…)
  Tier 2 ─ Live MCP registry     (registry.modelcontextprotocol.io)
  Tier 3 ─ LLM synthesis fallback (always labeled "synthesized" / demo)
```

### Key Design Choices

| Choice | Rationale |
|---|---|
| **Vickrey 2nd-price auction** | Winner pays the runner-up bid → honest bidding is dominant strategy |
| **Multi-dimensional reputation** | Speed, accuracy, quality, value — not a single number |
| **Graceful degradation** | Remote MCP failure → fallback to LLM persona, clearly labeled |
| **Context enrichment** | Hyperspell seeds brand context; Nia adds campaign memory before bidding |
| **Parent/child tasks** | Decomposed sub-tasks each run the full auction lifecycle independently |
| **market_ready flag** | `!!mcp_endpoint && envKeyPresent` — the canonical filter for live supply |

---

## Sponsor Specialists (All 10 Nozomio Sponsors)

| Agent | Sponsor | MCP | Campaign role |
|---|---|---|---|
| `reacher-social` | **Reacher** | ✓ `api.reacherapp.com/mcp` | TikTok Shop creators, GMV history, sandboxed write endpoints. Data source of truth. |
| `nia-context` | **Nia (Nozomio)** | soft | Campaign memory, indexed briefs, cross-session brand context. |
| `hyperspell-brain` | **Hyperspell** | soft | Brand persona synthesis, audience-fit rationale. |
| `tensorlake-exec` | **Tensorlake** | soft | GMV evidence verification, sample feasibility, brand-safety risk. |
| `codex-writer` | **OpenAI Codex** | soft | Creator-specific outreach drafts, follow-ups, sample-request payloads. |
| `devin-engineer` | **Devin** | soft | End-to-end campaign operator (discovery → launch plan). |
| `vercel-v0` | **Vercel (v0)** | soft | Campaign landing pages, hero copy, creator-brief docs. |
| `insforge-backend` | **InsForge** | soft | Postgres + auth + storage + edge functions for agent-driven campaigns. |
| `aside-browser` | **Aside** | soft | Drives outreach inside browser (TikTok DMs, creator profiles). |
| `convex-realtime` | **Convex** | soft | Real-time campaign state sync across all agents and dashboards. |

**To flip a `soft` agent to live MCP**: edit `lib/specialists/<agent>.ts`, add `mcp_endpoint` and `is_verified: true`, then swap `makeMockSpecialist(CONFIG)` for `makeMcpForwardingSpecialist(CONFIG)`. No other changes needed — the registry, leaderboard, and `/agents` page auto-detect.

---

## How MCP-Connected Specialists Work

1. **Bid time** — call `tools/list` on their MCP server (cached per-process), inject tool names+descriptions into the bid prompt, let the model decide fit and cost.
2. **Execute time** — run an OpenAI function-calling loop with MCP tools surfaced as functions; proxy each `tool_call` to the remote MCP via `tools/call`; feed results back; repeat up to 6 rounds.
3. **Graceful degradation** — if `tools/list` fails or the remote errors, the specialist answers in persona and notes that live tool calls weren't made.

See `lib/mcp-outbound.ts` and `lib/specialists/mcp-forwarding.ts`.

---

## Protocol Surfaces

Three transports share the same Convex backend and the same auction. They can be mixed freely.

### A2A — `POST /api/a2a/market`

A2A v0.3.0 agent. Four intents via `metadata.intent`:

| Intent | Maps to | `metadata.params` |
|---|---|---|
| `discover` | list_specialists | `{ task_type? }` |
| `post_task` (default) | post_task | `{ prompt?, max_budget, task_type?, output_schema? }` |
| `get_task` | get_task | `{ task_id }` |
| `raise_dispute` | raise_dispute | `{ task_id, reason }` |

### MCP — `POST /api/mcp`

Four public tools: `post_task`, `get_task`, `list_specialists`, `raise_dispute`.

Additional admin/discovery tools: `suggest_specialists`, `discover_specialist`, `upsert_product_context`, `override_judge` — see `lib/mcp-tools.ts`.

Add to an MCP client config:
```json
{ "mcpServers": { "arbor": { "url": "https://miyohacks.vercel.app/api/mcp" } } }
```

### REST / SDK / CLI

| Method | Path | Operation |
|---|---|---|
| `POST` | `/api/v1/tasks` | post_task |
| `GET` | `/api/v1/tasks/:id` | get_task |
| `GET` | `/api/v1/specialists` | list_specialists |
| `POST` | `/api/v1/tasks/:id/dispute` | raise_dispute |
| `POST` | `/api/v1/tasks/:id/override` | override_judge (admin) |

TypeScript SDK (`packages/sdk-core`):
```ts
import { createAuctionClient } from "@agent-auction/sdk-core";
const arbor = createAuctionClient({ baseUrl: "http://localhost:3000" });
const { task_id } = await arbor.postTask({ prompt: "...", max_budget: 2.0 });
const final = await arbor.awaitTask(task_id);
```

CLI (`packages/cli`):
```bash
arbor market list --ready-only
arbor market post "brief text" --budget 2.0 --wait
arbor task get <id>
arbor task dispute <id> "reason"
```

---

## Database Schema (Convex)

Key tables in `convex/schema.ts`:

| Table | Purpose |
|---|---|
| `agents` | Specialist metadata, reputation score, capabilities, `mcp_endpoint` |
| `tasks` | Full lifecycle; status flows through the state machine below |
| `bids` | Per-agent bids with multi-dimensional Vickrey scoring |
| `escrow` | Payment escrow: `locked` → `released` / `refunded` (simulated; no real money) |
| `reputation_events` | Reputation delta log per task |
| `reputation_dimensions` | Per-dimension scores: speed / accuracy / quality / value |
| `lifecycle_events` | Full audit trail of state transitions |
| `agent_tool_calls` | Tool call log for auditing |
| `product_context_profiles` | User product/repo context for Hyperspell |
| `task_contexts` | Business + repo context enrichment |
| `task_intakes` | Multi-turn intake conversation state |
| `task_intake_messages` | Intake message history |
| `agent_keys` / `a2a_nonces` | HMAC signing & replay protection |
| `discovered_specialists` | Cache of dynamically found/synthesized agents |

Task status machine:
```
open → planning → plan_review → bidding → awarded → executing
     → judging → synthesizing → complete
                                        → disputed → (retry judging)
                              → cancelled
                              → failed
```

---

## Convex Rules

**Always read `convex/_generated/ai/guidelines.md` before touching any Convex code.** That file is the authoritative source for validators, HTTP endpoints, function registration, and generated API usage — it overrides training data.

- Use generated `api` and `internal` references; never invent Convex function paths.
- `internal.*` functions hold complex business logic; public functions are thin wrappers.
- **Actions** = long-running work (OpenAI calls, external APIs). **Queries** = read-only. **Mutations** = writes.
- After schema or function changes, run `npm run convex:once` before testing in the browser.
- If the browser reports `"Could not find public function"` — re-run `npm run convex:dev`.
- HTTP endpoints go in `convex/http.ts` using `httpAction`; the path is registered exactly as written.

---

## Authentication & External Services

- **Auth**: Clerk (root app). Dev keys go in `.env.local` — never print secrets in responses.
- **Backend**: Convex. Production env vars are set on the Convex dashboard, not in Vercel.
- **OpenAI**: Required for bidding, execution, and judging. Set `OPENAI_API_KEY` in both `.env.local` and the Convex dashboard.

Do not create, delete, or mutate external resources unless the user explicitly requested it. For auth flows, use disposable test credentials only — pause and confirm before any real account creation.

---

## Environment Variables

Required for local dev (see `.env.example` for full list):

```
OPENAI_API_KEY
CONVEX_DEPLOYMENT
NEXT_PUBLIC_CONVEX_URL
NEXT_PUBLIC_APP_URL          # default: http://localhost:3000
```

Optional sponsor integrations (app degrades gracefully without them):

```
REACHER_API_KEY
NIA_API_KEY
HYPERSPELL_API_KEY / HYPERSPELL_USER_ID
TENSORLAKE_API_KEY / TENSORLAKE_A2A_ENDPOINT / TENSORLAKE_A2A_AGENT_CARD_URL
DEVIN_API_KEY / DEVIN_ORG_ID / DEVIN_A2A_ENDPOINT / DEVIN_A2A_AGENT_CARD_URL
V0_API_KEY
INSFORGE_API_KEY / INSFORGE_API_BASE_URL
```

---

## Frontend Conventions

- **Framework**: Next.js 15 App Router + React 19. Server components by default; add `"use client"` only when necessary.
- **Styling**: Tailwind CSS with custom brand palette (`brand-50` → `brand-900`, `surface-*`, `ink-*`, semantic success/warning/danger/info). Dark mode is class-based.
- **Components**: Shadcn/Radix headless pattern. Use CVA (`class-variance-authority`) for variants.
- **Animations**: Framer Motion (`fade-in`, `scale-in`, `soft-pulse`). Keyframes live in `tailwind.config.ts`.
- **Icons**: Phosphor Icons (`@phosphor-icons/react`) preferred; Lucide also installed.
- **Class merging**: `cn()` (clsx + tailwind-merge) for conditional classNames.
- **Font**: Nunito variable (300–900) via `next/font/google` in `app/layout.tsx`.

---

## Testing

```bash
npm test
# tsx lib/intake-normalize.test.ts && tsx lib/tool-call-audit.test.ts
```

No Jest/Vitest. Tests are plain `tsx` scripts. Follow the same pattern when adding new test files.

---

## Browser / E2E Checks

- Use the in-app Browser plugin when asked to inspect, click through, or screenshot the local site.
- Start from `http://localhost:3000` (or the port printed by `npm run dev`).
- Verify visible UI after each meaningful action with a DOM snapshot or screenshot.
- For agent-specialist flows, confirm at least one visible bid, recommendation, or delivery appears before reporting success.

---

## Common Debugging

| Symptom | Likely cause | Fix |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL is not set` | Convex not running locally | `npm run convex:dev` |
| `market_ready: false` everywhere | No sponsor MCP env vars set | Set `REACHER_API_KEY` (or another sponsor key) |
| HTTP 500 on `post_task` | Convex backend offline | Check `convex dev` output |
| `"Could not find public function"` | Stale generated Convex code | Re-run `npm run convex:dev` |
| `awaitTask timeout` | Auction took longer than poll window | Pass `--wait` only for fast terminal states; poll manually otherwise |

---

## Product Expectations

Expected task flow: **description → intake → planning → specialist shortlist → bids → execution → judge verdict → settlement**

- Keep UI copy concrete and product-facing. No instructional filler unless the user asks.
- Specialist responses must be clearly labeled: real tool-backed / A2A/MCP-backed / fallback / mock-synthesized.
- **Never** make fallback specialists appear to have live tools when they do not.
- `my-app/` is a separate Convex/React/Vite template — do not treat it as part of the main Arbor app.
- Escrow is simulated in Convex (`locked`/`released`/`refunded`) — no real money moves.

---

## Expected Workflow for AI Agents

1. Read existing code and local conventions before changing behavior.
2. Prefer small, targeted edits that preserve the product direction already in the repository.
3. Use the Grep tool for search (never raw `grep`/`find` shell commands).
4. Do not revert or overwrite user changes unless explicitly asked.
5. When changing frontend behavior, run the local app and verify the actual browser experience.
6. After Convex changes, run codegen before browser verification.
7. Report blockers clearly: auth, missing env vars, Convex codegen mismatch, provider rate limits.

---

## Model Routing (AI Agent Delegation)

The main agent is the **flagship model (Opus-class)** — treat it as the executive. Delegate downward whenever the task fits a cheaper model. Approximate cost ratio: **Opus ≈ 5× Sonnet ≈ 60× Haiku ≈ free for local Ollama**.

### Stay on Opus (executive — do not delegate)

- Multi-file refactors, architecture decisions, ambiguous specs.
- Long-context synthesis (reading large parts of the repo).
- Routing decisions themselves.
- Debugging where root cause may span unfamiliar files.
- Auth, schema migrations, escrow/payment flows — anything expensive to undo.

### Delegate to Sonnet — fast, capable coding

`Agent(model: "sonnet", ...)`

- Single-file or well-scoped code changes with a clear spec.
- Writing/updating tests for a known module.
- Code review of a small diff.
- Mechanical refactors (rename, extract, inline) once the plan is decided.

### Delegate to Haiku — cheap, fast, simple

`Agent(model: "haiku", ...)`

- Simple lookups (find where X is defined, list files matching a pattern).
- One-line edits, commit message drafts, PR descriptions, changelog entries.
- Summarization, classification, format conversions (JSON ↔ YAML).
- Polishing prose where the substance is already correct.
- Avoid for multi-step reasoning.

### Parallel and Background Execution (Memory-Aware)

This machine often runs Next.js, Convex, and large local models simultaneously — RAM is the bottleneck.

| Situation | Prefer |
|---|---|
| 3+ independent lookups / file searches | One message, multiple Haiku/Explore agents in parallel |
| Large repo exploration while implementing | Background explore agent; keep coding on Sonnet |
| Long local inference (35B, R1) | Single serial background job; fast lane for anything else concurrent |
| Convex `dev` / `once` + UI check | Run Convex in background terminal; verify browser in parallel |
| Dependent steps (A must finish before B) | Serial — no fake parallelism |

Do **not** run two deliberate-lane Ollama models (14B+) simultaneously unless the user explicitly wants it and has RAM headroom.

### Local Models (Ollama)

`Bash`: `ollama run <model> "<prompt>"`. Strip TUI escape codes with `sed 's/\x1b\[[0-9;]*[a-zA-Z]//g'` when capturing output.

Use local when: data is sensitive, offline, or bulk batch (hundreds of calls) where $0 cost beats ~5–10 s/call latency.

**Fast lane (seconds per call):**

| Model | Best for | Avoid for | Cold latency |
|---|---|---|---|
| `qwen2.5-coder:7b` | Default local code worker. Generation, refactor, extraction. | Architecture / ambiguous specs. | ~4 s |
| `llama3.2:3b` | Bulk classification, labeling, one-word answers. | Anything needing depth. | ~10 s |
| `qwen2.5:7b` | Structured prose, summaries, CHANGELOGs. Strong format-following. | Multilingual nuance. | ~2 s warm / ~5 s cold |
| `gemma3:4b` | Multilingual translation only. | English structured prose, strict-format outputs. | ~10 s |

**Deliberate lane (30 s–3 min — quality over speed):**

| Model | Best for | Avoid for | Cold latency |
|---|---|---|---|
| `gemma4:31b-mlx` | Multilingual / translation / nuanced classification. | Heavy coding. | ~31 s |
| `deepseek-r1:14b` | Reasoning, math, structured decomposition. | Production prose, time-sensitive work. | ~40 s |
| `qwen3.5:35b-mlx` | Highest-quality local code generation. | Anything latency-sensitive. | ~3 min 10 s |

Stay in the fast lane unless there's a specific reason to pay the latency cost. `qwen2.5-coder:7b` is ~48× faster than `qwen3.5:35b-mlx` on simple prompts and usually produces equivalent output.

### Decision Order

1. Sensitive data or offline? → local fast lane.
2. Bulk batch (hundreds of calls)? → local fast lane.
3. Haiku sufficient with a one-shot prompt? → Haiku subagent.
4. Clear spec exists? → Sonnet subagent.
5. Multilingual nuance or hard reasoning? → local deliberate lane.
6. Otherwise → handle inline on Opus.

### Reporting Agent Activity

End-of-turn summaries **must** include a per-agent line when delegation occurred:

- **Who**: subagent type + model (e.g. `Explore (Sonnet)`, `Plan (Opus)`, `local qwen2.5-coder:7b`)
- **What**: one-phrase task description
- **Cost signal**: approximate token count for Anthropic agents; wall-clock seconds for local models

The `Agent` tool does not return exact token counts — estimate from prompt + response length × 3–10× multiplier for internal tool-use loops.

### Per-Task Delegation in Plans

Every plan **must** end with a delegation table assigning each task to one of: `{Opus inline, Sonnet subagent, Haiku subagent, local <model>}`. A plan that puts every task on Opus is a bug — fix it before starting.

---

## Deployment

- **Frontend**: Vercel (auto-deploys on push via `vercel.json`).
- **Backend**: Convex (separate deployment; env vars managed on the Convex dashboard, not Vercel).
- **Live app**: `https://miyohacks.vercel.app`

Always commit and push before ending a remote session — the container is ephemeral.
