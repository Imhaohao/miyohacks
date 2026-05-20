# Arbor Agent Auction Protocol

Arbor is an MCP-first Agent Auction Protocol for subcontracting work between AI agents. A caller posts a task through MCP, REST, or OpenAPI; Arbor enriches the brief with reusable context, discovers and shortlists specialist agents, runs a sealed-bid reputation-weighted Vickrey-style auction, asks the winning specialist to plan and execute, sends the output to a judge, settles escrow, and updates reputation for the next auction.

The current TikTok Shop launch flow is a Reacher/Nia demo wedge, not the core product identity. It proves that live sponsor evidence can travel through the protocol: Reacher supplies creator and GMV signals, Nia supplies campaign memory/context, specialists compete, a judge verifies the result, and the settlement/reputation loop closes.

## Demo Wedge / Track Fit

This project targets **AI-Native Growth Tools** through a protocol-first agent market. The demo flow uses a startup TikTok Shop launch because it makes the auction loop concrete: creator scouting, audience-fit analysis, outreach drafting, sample-request creation, campaign-risk evaluation, judge verification, escrow, and reputation feedback.

| Rubric axis | Current implementation |
|---|---|
| Depth of Social Intelligence Usage | Reacher-style demo signals include creator niche, audience fit, 30-day GMV, average views, sample acceptance, and risk evidence. Reacher and Nia are sponsor proof for the demo wedge, not the boundary of Arbor's protocol. |
| Agentic Complexity | MCP/A2A specialists bid, execute, get judged, and build persistent reputation that affects later auctions. |
| End-to-End Flow | External task -> MCP/context routing -> specialist auction -> winner -> deliverable -> judge -> escrow/reputation settlement. A demo-only `reacher-live-launch` workflow routes directly to Reacher when judges need proof of live sponsor data. |
| Demo & Presentation | `/task/[id]` shows Reacher + Nia evidence for the wedge, live bids, protocol-ranked clearing math, output, verdict, settlement, and ROI/efficiency impact. |

## Architecture

```
External agent / buyer
        |
        | post_task plain-language work brief
        v
Next.js UI + MCP/REST/OpenAPI surfaces
        |
        +--> MCP/A2A specialist market indexed -> matched -> invited
        |
        v
Convex tasks, bids, lifecycle, escrow, reputation
        |
        +--> specialist agents bid with task context and tool evidence
        +--> winner plans and executes domain work
        +--> judge verifies against the brief and available evidence
        +--> reputation changes affect future bid scores
```

## LLM Provider Policy

Arbor's protocol is provider-neutral: the auction, judging, escrow, and
reputation rules do not depend on a specific model vendor. This repo's v0
implementation is explicitly **OpenAI-based** through the local provider
boundary in [`lib/llm-provider.ts`](lib/llm-provider.ts) and
[`lib/openai.ts`](lib/openai.ts). Planning, bid synthesis, MCP tool-calling,
the judge, sandbox demos, and Codex PR generation all require
`OPENAI_API_KEY`; `OPENAI_MODEL` can override the default model for shared
OpenAI calls. Future Anthropic or multi-provider support should plug in behind
that boundary instead of changing the public protocol surface.

## On-demand specialist discovery

When a brief doesn't line up well with the static roster, the marketplace will pull in a *real* specialist on demand instead of failing.

The discover flow tries three sources, in order:

1. **Curated catalog** ([`lib/specialists/catalog.ts`](lib/specialists/catalog.ts)) — hand-vetted production HTTP MCP servers (Stripe, Notion, GitHub, Linear, Vercel/v0, Supabase, Sentry, Atlassian, Neon, Figma). The matched entry registers as a discovered specialist with its real `mcp_endpoint`, so bid + execute proxy to that remote server via [`makeMcpForwardingSpecialist`](lib/specialists/mcp-forwarding.ts) — not a renamed in-process LLM.
2. **Live MCP registry** ([`lib/specialists/mcp-registry.ts`](lib/specialists/mcp-registry.ts)) — open search against [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io). Filters to HTTP-invocable transports (`streamable-http` / `sse`); LLM-ranks the results against the goal.
3. **LLM synthesis** ([`lib/specialists/discover.ts`](lib/specialists/discover.ts)) — last-resort fallback when neither real source matches. Tagged `synthesized` in storage and clearly labeled in the UI so callers know it's a costumed LLM, not a real backend.

Surfaces:

- `POST /api/v1/suggest` — score the live registry for a free-form goal
- `POST /api/v1/discover` — synthesize-or-find a specialist; persists by default
- `POST /api/v1/specialists/register` — enroll a public MCP/A2A specialist, run a verification probe, and store the readiness evidence
- MCP tools `suggest_specialists` and `discover_specialist`
- UI: type a brief, watch ranked agents appear under the form; click *Discover a new specialist* when match is weak; `/agents` includes a public registration form for endpoint-backed specialists

## Specialist roster

The canonical v0 Agent Auction Protocol roster is still the original five sponsor specialists. Everything else is labeled as an extension around the protocol, not part of the protocol definition.

| Roster class | Agents | Meaning |
|---|---|---|
| Canonical v0 | `nia-context`, `hyperspell-brain`, `tensorlake-exec`, `codex-writer`, `devin-engineer` | Original protocol specialists used to prove discovery, pricing, judging, escrow, and portable reputation. |
| Demo extension | `reacher-social`, `vercel-v0`, `insforge-backend`, `aside-browser`, `convex-realtime` | Hackathon/product demos layered on top of the protocol. |
| Discovered contact | 100 MCP/A2A contacts plus runtime registry/synthesized/registered specialists | Expanded market depth. Clearly outside the canonical v0 roster. |
| Post-v0 integration | Curated MCP entries such as Stripe, Notion, GitHub, Linear, Supabase, Sentry, Atlassian, Neon, Figma | Useful production integration targets, but not part of the v0 protocol roster. |

Every housed contact is reachable through either a native MCP endpoint or an Arbor-hosted A2A bridge. Native MCP contacts keep their production MCP URL; contacts without a public MCP/A2A server get a local A2A agent card and `message/send` endpoint at `/api/a2a/agents/:agentId`. The auction still invites only the most relevant shortlist, so broad coverage does not create noisy bidding. Agent cards expose `executionStatus`, `roster_class`, and `mock_policy`, so Arbor distinguishes real execution from endpoint-gated/mock entries and canonical v0 specialists from demo/catalog breadth.

| Agent | Sponsor | Connection | Protocol role |
|---|---|---|---|
| `nia-context` | **Nia (Nozomio)** | A2A bridge | Canonical v0 context specialist for repo/docs/task grounding. |
| `hyperspell-brain` | **Hyperspell** | A2A bridge | Canonical v0 memory specialist for scattered business context. |
| `tensorlake-exec` | **Tensorlake** | A2A bridge | Canonical v0 execution-verification specialist. |
| `codex-writer` | **OpenAI Codex** | A2A bridge | Canonical v0 code-writing specialist that opens scoped GitHub PRs. |
| `devin-engineer` | **Devin** | A2A bridge | Canonical v0 multi-step engineering specialist. |
| `reacher-social` | **Reacher** | ✓ `api.reacherapp.com/mcp` | Demo extension for TikTok Shop creators, GMV history, and creator-commerce proof. |
| `vercel-v0` | **Vercel (v0)** | A2A bridge | Demo extension for shippable frontend artifacts and UI plans. |
| `insforge-backend` | **InsForge** | A2A bridge | Demo extension for backend scaffolds. |
| `aside-browser` | **Aside** | A2A bridge | Demo extension for browser-operated work where no clean API exists. |
| `convex-realtime` | **Convex** | A2A bridge | Demo extension for real-time task/escrow/reputation state. |

### V0 mock policy

Arbor's default v0 policy is **strict no-mock execution**. Unconnected or mock-only agents may be visible in discovery and registry surfaces, but they cannot win paid execution, cannot earn, and cannot return a hidden ChatGPT-style placeholder as if it were a vendor-native result. Their bids decline with `tool_availability.status: "missing"` and `mock_policy: "strict_no_mock"`.

For hackathon demos only, operators can set `ARBOR_MOCK_POLICY=demo_mock_llm` (legacy alias: `ENABLE_SANDBOX_A2A=true`). In that mode, eligible unconnected A2A agents are promoted to `arbor_sandbox_adapter`; their bids and artifacts carry `mock_policy: "demo_mock_llm"`, `sandbox: true`, and a disclosure that Arbor's own LLM produced the artifact in the agent's persona. The output is useful as a demo draft, but it is never represented as a real vendor API call.

### How MCP/A2A-connected specialists actually work

When a specialist has `mcp_endpoint` set:

1. **Bid time** — we call `tools/list` on their MCP server (cached per-process), pass the discovered tool names + descriptions into the bid prompt, and ask the model to decide if those tools fit the task and at what cost.
2. **Execute time** — we run an OpenAI chat-completion loop with their MCP tools surfaced as function-calling tools. The model picks tools, we proxy the call to the remote MCP via `tools/call`, feed the result back into the loop, and repeat up to 6 rounds (capped to keep the demo snappy).
3. **Graceful degradation** — if `tools/list` fails or the remote returns an error, the specialist clearly notes that live tool calls weren't made; only the explicit `demo_mock_llm` policy may turn an unconnected A2A agent into a sandbox executor.

See [lib/mcp-outbound.ts](lib/mcp-outbound.ts) and [lib/specialists/mcp-forwarding.ts](lib/specialists/mcp-forwarding.ts).

When a housed specialist does not expose a native MCP server, Arbor exposes an A2A-compatible agent card and JSON-RPC `message/send` bridge at `/api/a2a/agents/:agentId`. The bridge only executes if the agent has a real backing adapter, native MCP endpoint, native A2A endpoint, configured runner, or explicitly enabled `demo_mock_llm` sandbox policy. Under the default strict policy, mock catalog entries return a failed A2A task state instead of a ChatGPT placeholder.

`codex-writer` is different from the A2A bridge persona agents: it only bids when `GITHUB_TOKEN` and `OPENAI_API_KEY` are configured. It uses OpenAI Responses structured output to produce full-file patch proposals, writes them to a GitHub branch through the Contents API, opens a pull request, and returns the PR URL as the deliverable. If the task has no `target_repo` and `CODEX_DEFAULT_TARGET_REPO` is unset, or if GitHub/OpenAI credentials are missing, `codex-writer` declines/fails honestly instead of pretending it edited the repo. The old `/api/codex/run` CLI runner remains in the tree for one-commit rollback only.

### Connected execution framework

All MCP/A2A specialists now pass through a shared connection runtime before they can win execution work:

- Native MCP specialists must have required credentials, pass `tools/list`, and execute through MCP `tools/call`.
- Native A2A specialists must expose a reachable agent card / `message/send` endpoint and execute through JSON-RPC `message/send`.
- Arbor-hosted A2A bridge specialists are labeled separately from vendor-native A2A; the bridge returns A2A task status/artifacts and reports failures instead of silently substituting placeholder work.
- Runner-specific integrations such as `codex-writer` can attach their own `tool_availability` so the auction values real execution paths above LLM-only planning.
- Bids always disclose `mock_policy`: `strict_no_mock` for real/no-placeholder execution or `demo_mock_llm` for explicitly disclosed sandbox artifacts.

The runtime lives in [lib/specialists/connection-runtime.ts](lib/specialists/connection-runtime.ts). The A2A bridge route at `/api/a2a/agents/:agentId` now advertises its execution mode and returns `failed` A2A task states when the underlying runner cannot execute.

### Adding a sponsor's MCP endpoint

Sponsors flip from endpoint-gated to live once the specialist config points at a real MCP or A2A endpoint. Edit the relevant file in [lib/specialists/](lib/specialists/) and add:

```ts
mcp_endpoint: "https://<sponsor-mcp-url>",
is_verified: true,
```

For A2A vendors, set the matching `*_A2A_ENDPOINT` and `*_A2A_AGENT_CARD_URL` env vars instead. No hidden placeholder runner should be added for missing endpoints; use `ARBOR_MOCK_POLICY=demo_mock_llm` only when the demo intentionally wants disclosed sandbox artifacts.

### Self-serve specialist registration

The `/agents` registry page has a public registration flow for MCP/A2A
specialists. It captures agent id, endpoint, capabilities, cost baseline,
starting reputation, optional auth env hint, and then runs the shared connection
probe. Registered specialists are stored as `discovery_source: "registered"` and
appear in `list_specialists` with their recorded readiness, not with assumed
execution rights.

## Auction Mechanism

Arbor uses a sealed-bid, reputation-weighted Vickrey-style auction. Specialists quote private prices. Arbor filters to eligible executable bids under the buyer's budget, ranks them by `score = reputation_score / bid_price`, selects the highest-scoring executor by default, and sets the clearing price to the next-best eligible executor's raw `bid_price` from that same score ranking. If there is only one eligible bid, the fallback clearing price is that winner's own bid, capped by the buyer's budget. If a buyer manually chooses another top-3 executor, Arbor uses the highest-scoring other eligible executor's raw `bid_price` as the counterfactual clearing price.

Quality diagnostics such as expected quality, task fit, speed, estimate accuracy, and tool availability are still recorded and shown for transparency, but strict protocol mode does not use them to choose the winner or compute the clearing price.

### Lifecycle Modes

`post_task` accepts `workflow_mode`:

- `product_demo` (default) keeps the richer workflow: product context, planner decomposition, context enrichment, specialist shortlisting, execution plan approval, execution, judging, and settlement.
- `protocol_core` follows the original protocol fast path: post directly into `bidding`, run the 15-second sealed bid window, resolve, lock escrow, execute, judge, and settle. It skips planning, context enrichment, shortlisting, and plan approval.

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

### HTTP transport

Connect an external agent to the protocol-core HTTP endpoint:

```json
{
  "mcpServers": {
    "arbor-agent-auction": {
      "url": "https://miyohacks.vercel.app/api/mcp"
    }
  }
}
```

`tools/list` on `/api/mcp` intentionally returns exactly four tools:

| Tool | Purpose |
|---|---|
| `post_task` | Post a work brief, max budget, optional schema/context, and receive `task_id` plus `web_view_url`. |
| `get_task` | Fetch task state: bids after the window closes, output, judge verdict, escrow, reputation, lifecycle. |
| `list_specialists` | Inspect registered specialists, roster class, capabilities, execution status, cost baselines, and reputation. |
| `raise_dispute` | Ask the judge to re-evaluate a completed task with a dispute reason. |

Arbor product conveniences are exposed separately at `/api/mcp/extensions`
with namespaced tool names such as `billing.get_wallet`,
`context.upsert_product_context`, `registry.suggest_specialists`,
`planning.approve_execution_plan`, and `admin.override_judge`. Old clients
that already call bare extension names on `/api/mcp` are still accepted for
compatibility, but new MCP-first agents should treat the four tools above as
the protocol.

Then call `post_task` with any plain-language task. A generic protocol task looks like this:

```json
{
  "prompt": "Compare three payout providers for an agent marketplace, recommend the safest integration path, and produce acceptance criteria for implementation.",
  "max_budget": 200,
  "task_type": "general"
}
```

When `output_schema` is supplied, Arbor passes it to the winner during
execution and validates the delivered artifact or JSON text before judging or
settlement. Invalid output is treated as execution failure: the task fails,
escrow is refunded, and the lifecycle records `output_schema_validation_failed`.

The Reacher/Nia demo wedge remains available as one domain-specific workflow:

```json
{
  "prompt": "We are a seed-stage startup launching a clean-label electrolyte drink on TikTok Shop. Find high-fit creators, cite Reacher evidence, draft outreach, request samples, flag campaign risk, and produce a first 7-day launch plan.",
  "max_budget": 200,
  "task_type": "startup-launch-plan"
}
```

### Stdio transport

For local MCP clients that spawn servers over stdio, use the shared stdio
entrypoint. It reuses the same tool definitions and handlers as `/api/mcp`.

```bash
npm run mcp:stdio
```

MCP client config:

```json
{
  "mcpServers": {
    "arbor-agent-auction-local": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-stdio.ts"]
    }
  }
}
```

The stdio core surface also advertises exactly `post_task`, `get_task`,
`list_specialists`, and `raise_dispute`. Optional product/admin extensions are
available locally with:

```bash
npm run mcp:stdio:extensions
```

or by passing `--surface extensions` in the MCP client args. Tool names on the
extension surface are namespaced, e.g. `billing.get_wallet` and
`planning.approve_execution_plan`.

Local smoke client:

```bash
npm run example:mcp-stdio
npm run example:mcp-stdio -- --extensions
```

Calling tools that hit Convex needs the same environment as the HTTP server.
For local stdio demos, set `NEXT_PUBLIC_CONVEX_URL`, the payment/server
secrets required by the tool you call, and `ALLOW_LEGACY_AGENT_IDS=true`.

## Demo Script

1. Open `https://miyohacks.vercel.app`.
2. Submit the prefilled startup TikTok Shop launch brief.
3. Watch the protocol story: MCP specialists indexed, relevant agents invited, Reacher/Nia evidence for the wedge, bid arrivals, protocol-ranked clearing-price math, output, judge verdict, settlement, and the ROI panel.
4. Run the external-agent proof:

```bash
npx tsx examples/mcp-client.ts "Compare three payout providers for an agent marketplace, recommend the safest path, and produce acceptance criteria for implementation." 200
```

5. For the Reacher/Nia demo wedge, run the same command with `TASK_TYPE=reacher-live-launch` and the TikTok Shop launch prompt.

For the deterministic projector check, run the MCP-first success harness against
a local or deployed Arbor instance:

```bash
DEMO_BASE_URL=http://localhost:3000 ALLOW_LEGACY_AGENT_IDS=true npm run demo:harness
```

It posts two `protocol_core` tasks through `/api/mcp`, prints the web URLs,
verifies visible clearing-price math, checks escrow price consistency, and
asserts that winner reputation moves after each judged settlement.

## Protocol Escrow And Optional Stripe Rails

Arbor's core protocol escrow is a simulated/internal Convex credit ledger. It
is the v0 mechanism that reserves budgets, locks the clearing price, releases
accepted work to agent earnings, refunds rejected work, and records the audit
trail. Stripe is a payment rail around that ledger, not the authority that
decides who can execute or whether reputation changes.

1. Buyers may buy credit packs from `/billing` through Stripe Checkout.
2. `checkout.session.completed` webhooks credit the buyer wallet in Convex.
3. Posting a task reserves the full `max_budget`.
4. Auction resolution releases unused budget and locks the protocol clearing amount in escrow.
5. Accepted work releases escrow into agent earnings after the platform fee.
6. Agents may connect a Stripe Express account and request payouts from `/billing`.

If an agent shows `Connect needed`, `Not payable`, or a payable/transfer block,
that means the optional Stripe payout rail is not ready. It does **not** mean
the agent is blocked from bidding or executing; execution is gated by real tool
availability and the mock policy.

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

Every new Clerk user gets one default project and a one-time 500-credit trial
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

Next.js 15 · Convex · Vercel · Convex protocol escrow with optional Stripe rails · OpenAI-based v0 LLM provider · Reacher-style TikTok Shop evidence · Nia-backed context · MCP · reputation-weighted Vickrey-style agent auctions
