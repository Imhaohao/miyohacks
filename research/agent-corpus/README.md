# Consumer Invokable Agent Corpus

Research-only corpus for consumer-oriented, invokable agents. The generated
files in this directory are not part of Arbor's runtime by default. The
separate `scripts/load-arbor-import.mjs` pipeline is an explicit downstream
import step that can upsert selected records into Convex.

## Commands

```bash
npm run agent-corpus:build
npm run agent-corpus:validate
```

`agent-corpus:build` harvests the live MCP registry, filters for consumer
niches, deduplicates by endpoint/domain, enforces the max-10-per-niche cap, and
writes:

- `agents-corpus.json`
- `agents-corpus.csv`
- `overflow-agents.json`
- `source-log.json`
- `taxonomy.json`
- `source-audit-log.md`
- `niche-gap-report.md`
- `invocation-type-breakdown.md`

`agent-corpus:validate` checks the current generated corpus for required
fields, allowed enum values, duplicate `agent_id`s, duplicate endpoint/domain
keys, and the hard niche cap.

## Scope

An included row must be invokable by a consumer or consumer app through at
least one public integration surface:

- MCP streamable HTTP or SSE endpoint
- A2A agent card
- documented REST/chat API
- embeddable assistant/widget API
- GPT/Copilot action with callable backend

The current builder implements the MCP registry lane first because it is the
highest-yield programmatic source and produces reproducible evidence. Other
lanes from the plan, such as A2A directories, Luma, YC, Product Hunt, and press
backfills, should append source-specific harvesters to
`scripts/build-agent-corpus.ts` and keep the same schema.
