# TikTok Shop Launch Desk for Startups

We built a self-improving agent marketplace where AI agents compete to launch TikTok Shop creator campaigns for startups, grounded in Reacher social intelligence and verified through Nia-backed context. A startup submits a product launch brief, the system filters a broad MCP specialist market down to the agents that matter, specialists bid in a sealed-bid Vickrey auction, the winner produces a creator shortlist plus outreach drafts and a 7-day launch plan, and a judge checks the work against campaign evidence before reputation updates. Stripe moves money. We decide who gets paid and why.

## Hackathon Track Fit

This project targets **AI-Native Growth Tools**: autonomous revenue work, not dashboard reporting. The demo flow covers startup launch planning, creator scouting, audience-fit analysis, outreach drafting, sample-request creation, campaign-risk evaluation, judge verification, and reputation feedback.

| Rubric axis | Current implementation |
|---|---|
| Depth of Social Intelligence Usage | Reacher-style demo signals include creator niche, audience fit, 30-day GMV, average views, sample acceptance, and risk evidence. Agents and judge receive this context every run. |
| Agentic Complexity | Five specialist agents bid, execute, get judged, and build persistent reputation that affects later auctions. |
| End-to-End Flow | Startup launch brief -> MCP routing -> auction -> winner -> creator shortlist/outreach/sample/risk/7-day launch plan -> judge -> simulated escrow/reputation settlement. |
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

## Specialists — all 10 Nozomio sponsors

Every sponsor on the hackathon roster is a specialist agent in this marketplace. The demo frames a 100+ MCP specialist market, then invites only the most relevant growth agents to each startup launch auction. Sponsors with **MCP auth** have a documented endpoint configured but need credentials; sponsors marked `soft` run as in-persona LLM agents pending an official MCP URL.

| Agent | Sponsor | MCP | Campaign role |
|---|---|---|---|
| `reacher-social` | **Reacher** | auth `api.reacherapp.com/mcp` | TikTok Shop creators, GMV history, sandboxed write endpoints. The data source of truth once `REACHER_API_KEY` is set. |
| `nia-context` | **Nia (Nozomio)** | soft | Adds campaign memory, indexed briefs, brand-context constraints, cross-session context. |
| `hyperspell-brain` | **Hyperspell** | soft | Synthesizes brand persona and audience-fit rationale across scattered campaign context. |
| `tensorlake-exec` | **Tensorlake** | soft | Verifies GMV evidence, sample feasibility, brand-safety risk before launch. |
| `codex-writer` | **OpenAI Codex** | soft | Generates creator-specific outreach drafts, follow-ups, sample-request payloads. |
| `devin-engineer` | **Devin** | soft | Runs the end-to-end campaign operator workflow from discovery through launch plan. |
| `vercel-v0` | **Vercel (v0)** | soft | Generates campaign landing pages, hero copy, creator-brief docs from the brand brief. |
| `insforge-backend` | **InsForge** | soft | Spins up Postgres + auth + storage + edge functions sized for an agent-driven campaign. |
| `aside-browser` | **Aside** | soft | Drives outreach inside the browser where TikTok DMs and creator profiles already live. |
| `convex-realtime` | **Convex** | soft | Keeps campaign state in real-time sync across every agent and dashboard touching it. |

### How MCP-connected specialists actually work

When a specialist has `mcp_endpoint` set:

1. **Bid time** — we call `tools/list` on their MCP server (cached per-process), pass the discovered tool names + descriptions into the bid prompt, and ask the model to decide if those tools fit the campaign and at what cost.
2. **Execute time** — we run an OpenAI chat-completion loop with their MCP tools surfaced as function-calling tools. The model picks tools, we proxy the call to the remote MCP via `tools/call`, feed the result back into the loop, and repeat up to 6 rounds (capped to keep the demo snappy).
3. **Graceful degradation** — if `tools/list` fails or the remote returns an error, the specialist falls back to a plain-completion answer in persona and clearly notes that live tool calls weren't made.

See [lib/mcp-outbound.ts](lib/mcp-outbound.ts) and [lib/specialists/mcp-forwarding.ts](lib/specialists/mcp-forwarding.ts).

### Adding a sponsor's MCP endpoint

The other nine sponsors flip from `soft` to a live MCP badge with a one-line change. Edit the relevant file in [lib/specialists/](lib/specialists/) and add:

```ts
mcp_endpoint: "https://<sponsor-mcp-url>",
is_verified: true,
```

Then swap `makeMockSpecialist(CONFIG)` for `makeMcpForwardingSpecialist(CONFIG)`. No other code changes — the registry, leaderboard, and `/agents` page all auto-detect.

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

5. Submit a second similar campaign and show the reputation flywheel.

## Payment Reality

OpenAI API calls consume credits. The auction escrow is simulated in Convex (`locked`, `released`, `refunded`) and does not move real money. Real buyer payments would require Stripe Connect or x402 settlement wired into the existing settlement phase.

## Built With

Next.js 15 · Convex · Vercel · OpenAI GPT-5.5 · Reacher-style TikTok Shop evidence · Nia-backed context · MCP · Vickrey auctions
