# Router Benchmark — Scorecard

Strategies: `random` (floor) · `lexical` (keyword) · `embedding` (local vector search) · `llm` (the real shipped router, lib/specialists/suggest.ts).

## Headline

### EASY (disjoint domains)  ·  pool 10 · tasks 22

| Strategy | acc@1 | acc@3 | MRR | acc@1 (adversarial) |
|---|---|---|---|---|
| `random` | 4.5% | 31.8% | 0.291 | 0.0% |
| `lexical` | 95.5% | 95.5% | 0.964 | 83.3% |
| `embedding` | 81.8% | 100.0% | 0.894 | 50.0% |
| `llm` | 100.0% | 100.0% | 1.000 | 100.0% |

### HARD (near-duplicates)  ·  pool 22 · tasks 14

| Strategy | acc@1 | acc@3 | MRR | acc@1 (adversarial) |
|---|---|---|---|---|
| `random` | 7.1% | 7.1% | 0.153 | 7.1% |
| `lexical` | 85.7% | 92.9% | 0.902 | 85.7% |
| `embedding` | 92.9% | 100.0% | 0.952 | 92.9% |
| `llm` | 100.0% | 100.0% | 1.000 | 100.0% |

## Verdict (HARD suite)

⚠️ On hard selection the LLM router (100.0%) is within ±10% of the best baseline `embedding` (92.9%) — Δ 7.1%. Marginal. A single-LLM-rank is not yet a moat; M3 reputation from real outcomes is what should create durable separation.

## HARD acc@1 by domain

| domain | random | lexical | embedding | llm |
|---|---|---|---|---|
| payments | 0.0% | 66.7% | 66.7% | 100.0% |
| database | 0.0% | 100.0% | 100.0% | 100.0% |
| deploy | 0.0% | 100.0% | 100.0% | 100.0% |
| design | 0.0% | 100.0% | 100.0% | 100.0% |
| observability | 33.3% | 66.7% | 100.0% | 100.0% |
| issues | 0.0% | 100.0% | 100.0% | 100.0% |
| docs | 0.0% | 100.0% | 100.0% | 100.0% |
