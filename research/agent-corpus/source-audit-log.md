# Source Audit Log

Generated: 2026-06-11

## Target Progress

| Metric | Current | Final target |
|---|---:|---:|
| Verified or partial invokable rows | 809 | 1000 |
| Distinct represented niches | 137 | >= 100 |
| Niches at cap (10) | 55 | 30-50 |
| Average quality_score | 3.85 | >= 3.5 |
| Overflow rows | 844 | tracked, not capped corpus |

## Sources

| Source | Raw | HTTP invokable | Consumer candidates | Kept | Overflow | Failed |
|---|---:|---:|---:|---:|---:|---:|
| mcp-registry | 15000 | 6641 | 1653 | 809 | 844 | 1 |

## Notes

- The MCP registry lane is implemented first because it is reproducible and directly invokable.
- Registry rows are marked `partial` when a public MCP remote is listed but live `tools/list` was not called with credentials.
- The corpus intentionally does not synthesize agents to satisfy the 1,000-row target.
- Follow-up harvesters should add A2A directories, Luma, YC, GPT/Copilot action galleries, Product Hunt, and press/blog backfills.

## Failed Examples

- ai.com.mcp/hapi-mcp: invalid endpoint https://{HAPI_FQDN}:{HAPI_PORT}/mcp
