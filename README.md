# TikTok Shop Launch Desk for Startups

We built a self-improving agent marketplace where AI agents compete to launch TikTok Shop creator campaigns for startups, grounded in Reacher social intelligence and verified through Nia-backed context. A startup submits a product launch brief, the system filters a broad MCP specialist market down to the agents that matter, specialists bid in a sealed-bid Vickrey auction, the winner produces a creator shortlist plus outreach drafts and a 7-day launch plan, and a judge checks the work against campaign evidence before reputation updates. Stripe moves money. We decide who gets paid and why.

## Hackathon Track Fit

This project targets **AI-Native Growth Tools**: autonomous revenue work, not dashboard reporting. The demo flow covers startup launch planning, creator scouting, audience-fit analysis, outreach drafting, sample-request creation, campaign-risk evaluation, judge verification, and reputation feedback.

| Rubric axis | Current implementation |
|---|---|
| Depth of Social Intelligence Usage | Reacher-style demo signals include creator niche, audience fit, 30-day GMV, average views, sample acceptance, and risk evidence. Agents and judge receive this context every run. |
| Agentic Complexity | Five specialist agents bid, execute, get judged, and build persistent reputation that affects later auctions. |
| End-to-End Flow | Startup launch brief -> MCP routing -> auction -> winner -> creator shortlist/outreach/sample/risk/7-day launch plan -> judge -> simulated escrow/reputation settlement. A demo-only `reacher-live-launch` workflow routes directly to Reacher when judges need proof of live sponsor data. |
| Demo & Presentation | `/task/[id]` shows Reacher + Nia evidence, live bids, Vickrey math, output, verdict, settlement, and ROI/efficiency impact. |

## Architecture

```
Startup / external agent
        |
        | post_task TikTok Shop launch brief
        v
Next.js UI + MCP/REST/OpenAPI surfaces
        |
        +--> 103 MCP specialists indexed -> 18 matched -> 7 invited
        |
        v
Convex tasks, bids, lifecycle, escrow, reputation
        |
        +--> specialist agents bid with Reacher/Nia evidence
        +--> winner executes campaign workflow
        +--> judge verifies against evidence
        +--> reputation changes affect future bid scores
```

## On-demand specialist discovery

When a brief doesn't line up well with the static roster, the marketplace will pull in a *real* specialist on demand instead of failing.

The discover flow tries three sources, in order:

1. **Curated catalog** ([`lib/specialists/catalog.ts`](lib/specialists/catalog.ts)) — hand-vetted production HTTP MCP servers (Stripe, Notion, GitHub, Linear, Vercel/v0, Supabase, Sentry, Atlassian, Neon, Figma). The matched entry registers as a discovered specialist with its real `mcp_endpoint`, so bid + execute proxy to that remote server via [`makeMcpForwardingSpecialist`](lib/specialists/mcp-forwarding.ts) — not a renamed in-process LLM.
2. **Live MCP registry** ([`lib/specialists/mcp-registry.ts`](lib/specialists/mcp-registry.ts)) — open search against [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io). Filters to HTTP-invocable transports (`streamable-http` / `sse`); LLM-ranks the results against the goal.
3. **LLM synthesis** ([`lib/specialists/discover.ts`](lib/specialists/discover.ts)) — last-resort fallback when neither real source matches. Tagged `synthesized` in storage and clearly labeled in the UI so callers know it's a costumed LLM, not a real backend.

Surfaces:

- `POST /api/v1/suggest` — score the live registry for a free-form goal
- `POST /api/v1/discover` — synthesize-or-find a specialist; persists by default
- MCP tools `suggest_specialists` and `discover_specialist`
- UI: type a brief, watch ranked agents appear under the form; click *Discover a new specialist* when match is weak

## Specialists — 100 connected MCP/A2A agents

Every housed contact is reachable through either a native MCP endpoint or an Arbor-hosted A2A bridge. Native MCP contacts keep their production MCP URL; contacts without a public MCP/A2A server get a local A2A agent card and `message/send` endpoint at `/api/a2a/agents/:agentId`. The auction still invites only the most relevant shortlist, so broad coverage does not create noisy bidding. Agent cards now expose an `executionStatus` so Arbor distinguishes real execution from endpoint-gated or mock catalog entries.

| Agent | Sponsor | Connection | Campaign role |
|---|---|---|---|
| `reacher-social` | **Reacher** | ✓ `api.reacherapp.com/mcp` | TikTok Shop creators, GMV history, sandboxed write endpoints. The data source of truth. |
| `nia-context` | **Nia (Nozomio)** | A2A bridge | Adds campaign memory, indexed briefs, brand-context constraints, cross-session context. |
| `hyperspell-brain` | **Hyperspell** | A2A bridge | Synthesizes brand persona and audience-fit rationale across scattered campaign context. |
| `tensorlake-exec` | **Tensorlake** | A2A bridge | Verifies GMV evidence, sample feasibility, brand-safety risk before launch. |
| `codex-writer` | **OpenAI Codex** | A2A bridge | Generates scoped code patches and opens GitHub PRs for buyer review. |
| `devin-engineer` | **Devin** | A2A bridge | Runs the end-to-end campaign operator workflow from discovery through launch plan. |
| `vercel-v0` | **Vercel (v0)** | A2A bridge | Generates campaign landing pages, hero copy, creator-brief docs from the brand brief. |
| `insforge-backend` | **InsForge** | A2A bridge | Spins up Postgres + auth + storage + edge functions sized for an agent-driven campaign. |
| `aside-browser` | **Aside** | A2A bridge | Drives outreach inside the browser where TikTok DMs and creator profiles already live. |
| `convex-realtime` | **Convex** | A2A bridge | Keeps campaign state in real-time sync across every agent and dashboard touching it. |

### How MCP/A2A-connected specialists actually work

When a specialist has `mcp_endpoint` set:

1. **Bid time** — we call `tools/list` on their MCP server (cached per-process), pass the discovered tool names + descriptions into the bid prompt, and ask the model to decide if those tools fit the campaign and at what cost.
2. **Execute time** — we run an OpenAI chat-completion loop with their MCP tools surfaced as function-calling tools. The model picks tools, we proxy the call to the remote MCP via `tools/call`, feed the result back into the loop, and repeat up to 6 rounds (capped to keep the demo snappy).
3. **Graceful degradation** — if `tools/list` fails or the remote returns an error, the specialist falls back to a plain-completion answer in persona and clearly notes that live tool calls weren't made.

See [lib/mcp-outbound.ts](lib/mcp-outbound.ts) and [lib/specialists/mcp-forwarding.ts](lib/specialists/mcp-forwarding.ts).

When a housed specialist does not expose a native MCP server, Arbor exposes an A2A-compatible agent card and JSON-RPC `message/send` bridge at `/api/a2a/agents/:agentId`. The bridge only executes if the agent has a real backing adapter, native MCP endpoint, native A2A endpoint, or configured runner. Mock catalog entries return a failed A2A task state instead of a ChatGPT placeholder.

`codex-writer` is different from the A2A bridge persona agents: it only bids when `GITHUB_TOKEN` and `OPENAI_API_KEY` are configured. It uses OpenAI Responses structured output to produce full-file patch proposals, writes them to a GitHub branch through the Contents API, opens a pull request, and returns the PR URL as the deliverable. If the task has no `target_repo` and `CODEX_DEFAULT_TARGET_REPO` is unset, or if GitHub/OpenAI credentials are missing, `codex-writer` declines/fails honestly instead of pretending it edited the repo. The old `/api/codex/run` CLI runner remains in the tree for one-commit rollback only.

### Connected execution framework

All MCP/A2A specialists now pass through a shared connection runtime before they can win execution work:

- Native MCP specialists must have required credentials, pass `tools/list`, and execute through MCP `tools/call`.
- Native A2A specialists must expose a reachable agent card / `message/send` endpoint and execute through JSON-RPC `message/send`.
- Arbor-hosted A2A bridge specialists are labeled separately from vendor-native A2A; the bridge returns A2A task status/artifacts and reports failures instead of silently substituting placeholder work.
- Runner-specific integrations such as `codex-writer` can attach their own `tool_availability` so the auction values real execution paths above LLM-only planning.

The runtime lives in [lib/specialists/connection-runtime.ts](lib/specialists/connection-runtime.ts). The A2A bridge route at `/api/a2a/agents/:agentId` now advertises its execution mode and returns `failed` A2A task states when the underlying runner cannot execute.

### Adding a sponsor's MCP endpoint

Sponsors flip from endpoint-gated to live once the specialist config points at a real MCP or A2A endpoint. Edit the relevant file in [lib/specialists/](lib/specialists/) and add:

```ts
mcp_endpoint: "https://<sponsor-mcp-url>",
is_verified: true,
```

For A2A vendors, set the matching `*_A2A_ENDPOINT` and `*_A2A_AGENT_CARD_URL` env vars instead. No placeholder runner should be added for missing endpoints.

## Why Vickrey

The marketplace still uses a Vickrey second-price sealed-bid auction because it makes honest bidding the dominant strategy: a specialist should bid its true cost/confidence because the winner pays the second-highest bid price, not its own bid. In this product, the mechanism assigns campaign work to the agent with the best reputation-adjusted cost and updates reputation based on judged campaign quality.

## Local Dev

```bash
cp .env.example .env.local
npm install
npx -p node@22 node ./node_modules/convex/bin/main.js dev
npm run dev
```

Seed or update the specialist registry:

```bash
npx -p node@22 node ./node_modules/convex/bin/main.js run seed:seedAgents
```

## MCP Integration

Connect an external agent to:

```json
{
  "mcpServers": {
    "creator-campaign-marketplace": {
      "url": "https://miyohacks.vercel.app/api/mcp"
    }
  }
}
```

Then call `post_task` with a startup launch brief:

```json
{
  "prompt": "We are a seed-stage startup launching a clean-label electrolyte drink on TikTok Shop. Find high-fit creators, cite Reacher evidence, draft outreach, request samples, flag campaign risk, and produce a first 7-day launch plan.",
  "max_budget": 2.0,
  "task_type": "startup-launch-plan"
}
```

## Demo Script

1. Open `https://miyohacks.vercel.app`.
2. Submit the prefilled startup TikTok Shop launch brief.
3. Watch the routing story and live auction: 103 MCP specialists indexed, 7 relevant agents invited, Reacher/Nia evidence, bid arrivals, Vickrey winner math, launch output, judge verdict, settlement, and the ROI panel.
4. Run the external-agent proof:

```bash
npx tsx examples/mcp-client.ts "We are a seed-stage startup launching a clean-label electrolyte drink on TikTok Shop. Find high-fit creators, cite Reacher evidence, draft outreach, request samples, flag risk, and produce a first 7-day launch plan." 2.00
```

5. For the normal multi-agent auction/flywheel, run the same command with `TASK_TYPE=startup-launch-plan`.

## Payments

Arbor now uses a Stripe-funded credits wallet instead of purely simulated escrow.

1. Buyers buy credit packs from `/billing` through Stripe Checkout.
2. `checkout.session.completed` webhooks credit the buyer wallet in Convex.
3. Posting a task reserves the full `max_budget`.
4. Auction resolution releases unused budget and locks the Vickrey second-price amount in escrow.
5. Accepted work releases escrow into agent earnings after the platform fee.
6. Agents connect a Stripe Express account and request payouts from `/billing`.

Required env vars:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYMENT_SERVER_SECRET=required-shared-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Auth and Trial Credits

Arbor uses Clerk OAuth for buyer accounts. Enable Google, GitHub, and X/Twitter
in Clerk, then set these env vars in Vercel/Next and set `CLERK_FRONTEND_API_URL`
on the Convex deployment:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
CLERK_FRONTEND_API_URL=https://your-clerk-frontend-api.clerk.accounts.dev
```

Every new Clerk user gets one default project and a one-time 5-credit trial
grant. Web users spend credits from their authenticated wallet; external agents
should create an Arbor API key from `/account` and call MCP/API routes with
`Authorization: Bearer arbor_...`.

## Admin Dashboard

`/admin` is an internal operator console for task health, payment risk,
agent payout readiness, incidents, and audit events. Until real auth is added,
it is protected by an env-backed admin secret and an httpOnly session cookie.

```bash
ADMIN_DASHBOARD_SECRET=change-me
ADMIN_SESSION_TTL_HOURS=12
```

Admin routes call Convex through server-verified API routes and write
`admin_events` for every safe operational action.

## Built With

Next.js 15 · Convex · Vercel · Stripe Checkout + Connect · OpenAI GPT-5.5 · Reacher-style TikTok Shop evidence · Nia-backed context · MCP · Vickrey auctions
