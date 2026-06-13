# A2A Agent Cards Audit

Generated: 2026-06-11

| Metric | Count |
|---|---:|
| Total parseable agent cards | 13 |
| Live well-known cards | 2 |
| Repository-hosted cards | 11 |

## Notes

- This sheet is intentionally separate from `agents-corpus.csv`, which is MCP-only.
- Rows marked `verified_live_card` had a parseable card fetched from a live `/.well-known/agent-card.json` or `/.well-known/agent.json` URL.
- Rows marked `verified_repo_card` had a parseable card in a public repository, but live well-known discovery was absent, timed out, or not successful from this environment.
- A2A Hub was identified as a promising directory, but `https://a2a.build` returned Cloudflare 521 during this run, so those listed agents were not added without card JSON evidence.
