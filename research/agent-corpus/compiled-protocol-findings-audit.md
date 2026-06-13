# Compiled Protocol Findings Audit

Generated: 2026-06-11

## Outputs

| File | Rows | Scope |
|---|---:|---|
| compiled-mcp-findings.csv | 1679 | MCP registry corpus, MCP overflow, YC MCP findings, broad MCP-related agent-company rows |
| compiled-a2a-findings.csv | 18 | A2A card sweep plus YC A2A/watchlist findings |

## Notes

- MCP overflow rows are included because they are valid findings excluded only by the capped-corpus 10-per-niche rule.
- A2A rows include both verified card rows and YC watchlist rows where A2A/agent-to-agent evidence exists but no card was found.
- `finding_status` is the key trust field. Treat `verified_live_card`, `verified_repo_card`, and `partial` differently from `watchlist_*` or `*_docs_only`.
- These compiled CSVs preserve duplicate companies across source sheets when the evidence source differs.
