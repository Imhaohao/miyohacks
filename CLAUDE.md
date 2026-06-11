# CLAUDE.md — Arbor Agent Marketplace

Guidance for AI agents working in this repository. Read this file before making any changes.

---

## Project Overview

**Arbor** is an agent-specialist marketplace/protocol app built for the Nozomio hackathon. It lets users post tasks that are routed through a Vickrey auction to competing AI specialist agents, which bid, execute, and get judged — with escrow-based settlement and multi-dimensional reputation tracking.

The primary interface is a **Next.js 15 App Router** application. The backend is **Convex** (real-time serverless database + functions). Specialists are connected via **MCP (Model Context Protocol)** endpoints.

---

## Repository Layout

```
miyohacks/
├── app/                    # Next.js App Router (primary user-facing app)
│   ├── page.tsx            # Landing page: hero, task posting form, scroll demo
│   ├── layout.tsx          # Root layout with Nunito font and providers
│   ├── globals.css         # Brand HSL color tokens and semantic variables
│   ├── providers.tsx       # ConvexClientProvider wrapper
│   ├── agents/page.tsx     # Browse specialists / leaderboard
│   ├── task/[id]/page.tsx  # Task detail: real-time auction, bids, judgment, settlement
│   ├── dashboard/page.tsx  # User dashboard
│   ├── present/page.tsx    # Presentation/demo view
│   └── api/
│       ├── v1/tasks/       # REST: POST task, GET by ID, dispute/override
│       ├── v1/suggest/     # Score and rank MCP specialists
│       ├── v1/discover/    # Synthesize or discover new specialists
│       ├── v1/specialists/ # List known specialists
│       ├── a2a/market/     # Agent-to-Agent protocol endpoint
│       ├── mcp/route.ts    # MCP server (tools: post_task, suggest_specialists, discover_specialist)
│       ├── .well-known/mcp.json/       # MCP manifest
│       ├── .well-known/ai-plugin.json/ # OpenAI plugin manifest
│       └── openapi.json/   # OpenAPI schema export
├── components/
│   ├── ui/                 # Shadcn-style headless + custom (ArborMark, buttons, cards)
│   ├── landing/            # Hero, scroll demo, orbital steps, footer
│   ├── agents/             # Agent cards, filtering, leaderboard
│   ├── task/               # Task lifecycle, bid list, verdict, settlement displays
│   ├── present/            # Presentation mode slides
│   ├── PostTaskForm.tsx    # Main task submission form
│   ├── AgentSuggestions.tsx
│   └── SpecialistLeaderboard.tsx
├── lib/
│   ├── specialists/        # 23 specialist definitions (MCP forwarding + mock fallbacks)
│   │   ├── catalog.ts      # Curated HTTP MCP servers (Stripe, Notion, GitHub, Linear, v0…)
│   │   ├── mcp-forwarding.ts    # Proxy calls to remote MCP endpoints
│   │   ├── mcp-registry.ts      # Query live registry at registry.modelcontextprotocol.io
│   │   ├── discover.ts          # LLM-based fallback specialist synthesis
│   │   ├── reacher-social.ts    # TikTok Shop creator/GMV lookup (primary sponsor)
│   │   ├── nia-context.ts       # Campaign memory & brand context
│   │   ├── hyperspell-brain.ts  # Brand persona synthesis
│   │   ├── devin-bridge.ts      # Devin AI integration
│   │   └── vercel-v0.ts         # Vercel v0 integration
│   ├── mcp-tools.ts        # MCP tool definitions for the marketplace
│   ├── mcp-outbound.ts     # Outbound MCP client + tool caching
│   ├── types.ts            # TypeScript types: Specialist, Bid, Task, etc.
│   ├── intake-normalize.ts # Task intake validation
│   ├── tool-call-audit.ts  # Tool call logging & auditing
│   ├── openai.ts           # OpenAI API wrapper
│   ├── suggest.ts          # Specialist ranking & discovery
│   └── registry.ts         # Specialist registry helpers
├── convex/                 # Backend: schema, functions, and generated code
│   ├── schema.ts           # Database schema (17 tables)
│   ├── auctions.ts         # Vickrey auction logic, winner selection
│   ├── tasks.ts            # Task creation, status updates, lifecycle
│   ├── bids.ts             # Bid submission & scoring
│   ├── intake.ts           # Multi-turn intake conversation
│   ├── planning.ts         # Task decomposition into sub-steps
│   ├── demos.ts            # Demo task seeding
│   ├── contextEnrichment.ts # Nia/Hyperspell context fetching
│   ├── agents.ts           # Agent registry management
│   ├── disputes.ts         # Dispute/appeal workflow
│   ├── reputation*.ts      # Reputation tracking
│   ├── seed.ts             # Database seeding
│   └── _generated/ai/guidelines.md  # ← READ THIS before touching Convex code
├── packages/               # Monorepo workspaces
│   ├── sdk-core/           # Zero-dep TypeScript REST client for the auction protocol
│   ├── cli/                # Command-line interface
│   ├── langchain/          # LangChain integration
│   ├── mastra/             # Mastra framework integration
│   └── vercel-ai/          # Vercel AI SDK integration
├── docs/
│   └── agent-quickstart.md # External agent integration guide (A2A, MCP, REST)
├── examples/
│   ├── mcp-client.ts       # Standalone MCP client demo
│   └── provision-agent-key.ts  # HMAC key provisioning
├── my-app/                 # Separate Convex/React/Vite template — NOT the main app
├── .env.example            # Source of truth for required environment variables
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

---

## Local Development Commands

```bash
npm install           # Install dependencies
npm run dev           # Start Next.js app (default: http://localhost:3000)
npm run build         # Production build
npm run typecheck     # TypeScript type check
npm test              # Run test scripts (tsx-based)
npm run lint          # ESLint
npm run convex:dev    # Run Convex backend in watch mode
npm run convex:once   # One-shot Convex codegen / schema push
```

If port 3000 is in use, Next.js picks the next free port — watch the terminal output.

---

## Architecture

```
User / External Agent
        │
        ▼
Next.js App (app/)
  REST API endpoints  ──→  /api/v1/tasks, /api/v1/suggest, /api/v1/discover
  MCP server          ──→  /api/mcp
  A2A endpoint        ──→  /api/a2a/market
        │
        ▼
Convex Backend (convex/)
  ├─ Intake          multi-turn task intake conversation
  ├─ Planning        decompose task into ordered sub-steps
  ├─ Auction         open bid window → collect bids → Vickrey winner selection
  ├─ Execution       winning specialist runs with MCP tools
  ├─ Judging         LLM judge evaluates delivery quality
  └─ Settlement      escrow release, reputation delta, lifecycle close
        │
        ▼
Specialist Agents (lib/specialists/)
  Tier 1 ── Curated HTTP MCP servers (Stripe, Notion, GitHub, Linear, v0, …)
  Tier 2 ── Live MCP registry (registry.modelcontextprotocol.io)
  Tier 3 ── LLM-synthesized fallback (labeled as demo — never presented as real)
```

### Key Design Choices

- **Vickrey (2nd-price) auction** — winner pays the runner-up's bid, so honest bidding is the dominant strategy.
- **Multi-dimensional reputation** — speed, accuracy, quality, value scores (not a single number).
- **Graceful degradation** — if a remote MCP endpoint fails, the specialist falls back to an LLM persona; this must be labeled.
- **Context enrichment** — Hyperspell seeds brand context; Nia adds campaign memory before bidding opens.
- **Parent/child tasks** — a task can be decomposed into sub-tasks (`parent_task_id`/`step_index`); each runs the full auction lifecycle independently.

---

## Database Schema (Convex)

Key tables in `convex/schema.ts`:

| Table | Purpose |
|---|---|
| `agents` | Specialist metadata, reputation score, capabilities |
| `tasks` | Full task lifecycle; status flows open → planning → bidding → executing → judging → complete |
| `bids` | Per-agent bids with Vickrey scoring dimensions |
| `escrow` | Payment escrow (locked / released / refunded) |
| `reputation_events` | Reputation delta log per task |
| `reputation_dimensions` | Per-dimension scores (speed/accuracy/quality/value) |
| `lifecycle_events` | Full audit trail of state transitions |
| `agent_tool_calls` | Tool call log for auditing |
| `product_context_profiles` | User product/repo context for Hyperspell |
| `task_contexts` | Business + repo context enrichment |
| `task_intakes` | Multi-turn intake conversation state |
| `task_intake_messages` | Intake message history |
| `agent_keys` / `a2a_nonces` | HMAC signing & replay protection |
| `discovered_specialists` | Cache of dynamically discovered agents |

Task status union: `open | planning | plan_review | bidding | awarded | executing | judging | synthesizing | complete | disputed | cancelled | failed`

---

## Convex-Specific Rules

**Always read `convex/_generated/ai/guidelines.md` before touching any Convex code.** That file is the source of truth for validators, HTTP endpoints, function registration, and generated API usage — it overrides anything from training data.

- Use generated `api` and `internal` references; never invent Convex function paths.
- Prefer `internal.*` functions for complex business logic; public functions are thin wrappers.
- Actions are for long-running work (OpenAI calls, external APIs). Queries are read-only. Mutations write.
- After schema or function changes, run `npm run convex:once` before testing in the browser.
- If the browser reports "Could not find public function", the generated Convex code or local backend is stale — re-run `npm run convex:dev`.
- Seed agents with: `npx convex run seed:seedAgents`

---

## Authentication & External Services

- **Auth**: Clerk (root app). Dev keys go in `.env.local` — never print secrets in responses.
- **Backend**: Convex (separate from Next.js; env vars for production are set on the Convex dashboard).
- **OpenAI**: Required for specialist bidding, execution, and judging. `OPENAI_API_KEY` must be set both in `.env.local` and on the Convex backend dashboard.

Do not create, delete, or mutate external resources unless the user explicitly requested that action. For signup/login flows, use disposable test credentials only — pause and confirm before any real account creation.

---

## Environment Variables

See `.env.example` for the full list. Required for local dev:

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

- **Framework**: Next.js 15 App Router with React 19. Server components by default; add `"use client"` only when necessary.
- **Styling**: Tailwind CSS with a custom brand palette (`brand-50` through `brand-900`, `surface-*`, `ink-*`, semantic success/warning/danger/info). Dark mode is class-based.
- **Components**: Shadcn/Radix headless pattern — unstyled primitives styled with Tailwind. Use CVA for variants.
- **Animations**: Framer Motion (`fade-in`, `scale-in`, `soft-pulse`). Custom Tailwind keyframes are defined in `tailwind.config.ts`.
- **Icons**: Phosphor Icons (`@phosphor-icons/react`) are preferred; Lucide is also installed.
- **Class merging**: Use `cn()` (clsx + tailwind-merge) for conditional classNames.
- **Font**: Nunito variable (300–900) loaded in `app/layout.tsx` via `next/font/google`.

---

## Testing

Tests are plain TypeScript scripts run via `tsx`:

```bash
npm test
# runs: tsx lib/intake-normalize.test.ts && tsx lib/tool-call-audit.test.ts
```

No Jest or Vitest config. When adding new test files, follow the same pattern — import and call assertions directly with `tsx`.

---

## Browser / E2E Checks

- Use the in-app Browser plugin when asked to inspect, click through, or screenshot the local site.
- Start from the root Next.js URL (usually `http://localhost:3000`).
- Verify visible UI after each meaningful action with a DOM snapshot or screenshot.
- For agent-specialist flows, confirm at least one visible bid, recommendation, or delivery appears before reporting success.

---

## Product Expectations

Arbor is an agent-specialist marketplace. The expected task flow is:

**task description → intake → planning → specialist shortlist → bids → execution → judge verdict → settlement**

- Keep UI copy concrete and product-facing. No instructional filler unless the user asks.
- Specialist responses must be clearly labeled: real tool-backed / A2A/MCP-backed / fallback / mock-synthesized.
- **Never** make fallback specialists appear to have live tools when they do not.
- The `my-app/` directory is a separate Convex/React/Vite template. Do not treat it as part of the main Arbor app.

---

## Expected Workflow for AI Agents

1. Read existing code and local conventions before changing behavior.
2. Prefer small, targeted edits that preserve the product direction already in the repository.
3. Use `rg` / `rg --files` for search. Avoid `find` or `grep` as Bash commands — use the Grep tool instead.
4. Do not revert or overwrite user changes unless explicitly asked.
5. When changing frontend behavior, run the local app and verify the actual browser experience.
6. After Convex changes, run codegen before browser verification.
7. Report blockers clearly: auth verification, missing env vars, Convex codegen mismatch, provider-side rate limits.

---

## Model Routing (AI Agent Delegation)

The main agent is **Opus** — treat it as the executive. Delegate downward whenever the task fits a cheaper or more specialized model. Approximate cost ratio: **Opus ≈ 5× Sonnet ≈ 60× Haiku ≈ free for local Ollama**.

### Stay on Opus (do not delegate)

- Multi-file refactors, architecture decisions, ambiguous specs.
- Long-context synthesis (reading large parts of the repo).
- Routing decisions themselves.
- Debugging where the root cause may span unfamiliar files.
- Anything where a wrong answer is expensive to undo (auth, schema migrations, escrow/payment flows).

### Delegate to Sonnet — fast, capable coding

`Agent(model: "sonnet", ...)`

- Single-file or well-scoped code changes with a clear spec.
- Writing or updating tests for a known module.
- Code review of a small diff.
- Mechanical refactors (rename, extract, inline) once the plan is decided.

### Delegate to Haiku — cheap, fast, simple

`Agent(model: "haiku", ...)`

- Simple lookups (find where X is defined, list files matching a pattern).
- One-line edits, commit message drafts, PR descriptions, changelog entries.
- Summarization, classification, format conversions (JSON ↔ YAML, kebab ↔ snake).
- Polishing prose where the substance is already correct.
- Avoid for multi-step reasoning.

### Delegate to local Ollama — private, free, slow

`Bash`: `ollama run <model> "<prompt>"`. Pipe long inputs via stdin. Strip TUI escape codes with `sed 's/\x1b\[[0-9;]*[a-zA-Z]//g'` when capturing output.

Use local when **at least one** applies: sensitive data that can't leave the machine, offline / quota exhausted, bulk batch tolerant of 30s–3min latency.

**Fast lane (seconds per call):**

| Model | Best for | Avoid for | Cold latency |
|---|---|---|---|
| `qwen2.5-coder:7b` | Default local code worker. Generation, refactor, structured extraction. | Architecture / ambiguous specs. | ~4 s |
| `llama3.2:3b` | Bulk classification, labeling, one-word answers. | Anything needing depth. | ~10 s |
| `qwen2.5:7b` | Structured prose, summaries, CHANGELOGs. Strong format-following. | Multilingual nuance. | ~2 s warm / ~5 s cold |
| `gemma3:4b` | Multilingual translation only. | English structured prose, strict-format outputs. | ~10 s |

**Deliberate lane (30s–3min per call — quality over speed):**

| Model | Best for | Avoid for | Cold latency |
|---|---|---|---|
| `gemma4:31b-mlx` | Multilingual / translation / nuanced classification. | Heavy coding. | ~31 s |
| `deepseek-r1:14b` | Reasoning, math, structured decomposition. | Production prose, time-sensitive. | ~40 s |
| `qwen3.5:35b-mlx` | Highest-quality local code generation. | Anything latency-sensitive. | ~3 min 10 s |

**Decision order:**
1. Sensitive data or offline? → local fast lane.
2. Bulk batch (hundreds of calls)? → local fast lane.
3. Haiku sufficient with a one-shot prompt? → Haiku subagent.
4. Clear spec exists? → Sonnet subagent.
5. Multilingual nuance or hard reasoning needed? → local deliberate lane.
6. Otherwise → handle inline on Opus.

### Reporting Agent Activity

End-of-turn summaries **must** include a per-agent line when delegation occurred:

- **Who**: subagent type + model (e.g., `Explore (Sonnet)`, `Plan (Opus)`, `local qwen2.5-coder:7b`)
- **What**: one-phrase task description
- **Cost signal**: approximate token usage for Anthropic agents, or wall-clock seconds for local models

The `Agent` tool does not return exact token counts — estimate from prompt + response length × 3–10× multiplier for internal tool-use loops.

### Per-Task Delegation in Plans

Every plan **must** end with a delegation table assigning each task to one of: `{Opus inline, Sonnet subagent, Haiku subagent, local <model>}`. A plan that puts every task on Opus is a bug — fix the plan before starting.

---

## Deployment

- **Frontend**: Vercel (auto-deploys on push via `vercel.json`).
- **Backend**: Convex (separate deployment; env vars managed on the Convex dashboard).
- **Live app**: `https://miyohacks.vercel.app`

Always commit and push before ending a remote session — the container is ephemeral.
