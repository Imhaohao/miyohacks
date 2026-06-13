Guidance for AI agents working in `/Users/yanzihao/Documents/miyohacks`.

## Model Routing (Executive Delegation)

The main agent here is the **flagship model** (for example, GPT-5.5 or an Opus-class model) — treat it as the executive. Delegate downward whenever the task fits a cheaper or more specialized model, and only keep work on the flagship model when it genuinely needs that level of capability. Approximate cost ratio: **flagship ≈ 5× Sonnet ≈ 60× Haiku ≈ free for local Ollama** (compute only, no network, slower).

Delegation mechanisms:
- **Cloud (Anthropic) subagents**: `Agent` tool with `model: "sonnet" | "haiku" | "opus"`.
- **Local models**: `Bash` tool running `ollama run <model> "<prompt>"` (pipe long prompts via stdin or a temp file).

### Parallel and background execution (memory-aware)

This machine often runs **Next.js**, **Convex**, and **large local models** (for example `qwen3.5:35b-mlx`) at the same time. RAM is the bottleneck more often than API cost. Prefer throughput without piling heavy jobs on one core or one GPU context.

**Default: parallelize or background independent work**

- Launch **multiple subagents in one message** when their tasks do not depend on each other's output (e.g. explore repo layout + grep for a symbol + read one known file).
- Use **background subagents** (`run_in_background: true` on the `Task` tool, or equivalent) for work that can finish while you continue on the flagship thread — broad exploration, test runs, long `ollama run`, Convex deploy/codegen waits.
- Do **not** block the executive turn waiting on a subagent if you can start it in the background and synthesize when it completes (or when the user asks for status).

**Serialize or avoid stacking when memory is tight**

- Do **not** run two **deliberate-lane** Ollama models (14B+) at the same time unless the user explicitly wants that and has headroom.
- Do **not** start a heavy local model while a **35B MLX** session is already loaded in another terminal unless necessary; prefer the **fast lane** (`qwen2.5-coder:7b`, `llama3.2:3b`) for concurrent local work.
- Prefer **Haiku/Sonnet subagents in parallel** over **multiple blocking `ollama run`** calls — cloud agents use remote compute; local models compete for the same machine RAM.

**Practical patterns**

| Situation | Prefer |
|---|---|
| 3+ independent lookups or file searches | One message, multiple Haiku/explore agents in parallel |
| Large repo exploration while you implement | Background explore agent; keep coding on flagship/Sonnet |
| Long local inference (35B, R1) | Background shell or single serial job; use fast lane for anything else |
| Convex `dev` / `convex:once` + UI check | Run Convex in background terminal; verify in browser in parallel |
| Dependent steps (A must finish before B) | Serial — no fake parallelism |

Before starting another heavy job, consider what is already running (`npm run dev`, `ollama run`, Convex watcher). If the user reports slowness or swap, **reduce concurrent local models** and **background the slowest work** instead of adding another blocking call.

### Stay on the flagship model (executive — do not delegate)

- Multi-file refactors, architecture decisions, ambiguous specs.
- Long-context synthesis (reading large parts of the repo to answer one question).
- Routing decisions themselves — picking which subagent or model to use.
- Debugging where the root cause may span unfamiliar files.
- Anything where a wrong answer is expensive to undo (auth, schema migrations, money/account flows in Arbor).

### Delegate to Sonnet 4.6 — fast, capable coding

`Agent(model: "sonnet", ...)`

- Single-file or well-scoped code changes with a clear spec.
- Writing or updating tests for a known module.
- Code review of a small diff.
- Mechanical refactors (rename, extract function, inline) once the plan is decided.
- Anything the flagship model *could* do but where the path is already obvious — Sonnet finishes faster and ~5× cheaper.

### Delegate to Haiku 4.5 — cheap, fast, simple

`Agent(model: "haiku", ...)`

- Simple lookups (find where X is defined, list files matching Y).
- One-line edits, commit message drafts, PR descriptions, changelog entries.
- Summarization, classification, format conversions (JSON ↔ YAML, kebab ↔ snake).
- Polishing prose where the substance is already correct.
- Avoid for multi-step reasoning — Haiku is shallow on purpose.

### Delegate to local models via Ollama — private, free, but **not fast**

`Bash`: `ollama run <model> "<prompt>"`. Pipe long inputs via stdin. Strip Ollama's TUI escape codes with `sed 's/\x1b\[[0-9;]*[a-zA-Z]//g'` when capturing for downstream parsing.

Use a local model when **at least one** applies:

- **Sensitive data**: code or content that shouldn't leave the machine.
- **Offline**: no network, or API quota exhausted.
- **Quality bulk** where you can wait: hundreds of items, each tolerant of ~30s–3min per call.

**Do not** reach for local for "bulk speed" — see latency numbers below. A Haiku API call finishes in ~1s; a local 35B model takes minutes. Local wins on price and privacy, not throughput.

**Installed on this machine** (verified 2026-05-27). Split by lane:

**Fast lane — no built-in CoT, seconds per call. Use these for bulk and inner loops.**

| Model | Best for | Avoid for | Cold latency |
|---|---|---|---|
| `qwen2.5-coder:7b` | Default local code worker. Code generation, refactor, structured extraction. Clean output, no thinking preamble. | Architecture / ambiguous specs (any local model). | **~4 s** |
| `llama3.2:3b` | Bulk classification, labeling, one-word answers. Most obedient to short-output constraints. | Anything needing depth. | **~10 s** |
| `qwen2.5:7b` | General fast-lane: structured prose, summaries, CHANGELOGs, light writing. Strong instruction-following — reliably honors strict-format prompts. Replaces `gemma3:4b` for English structured work. Verified 2026-05-27 against the same CHANGELOG prompt gemma3 failed: kept all 5 enum values, used the requested `[Unreleased]` header, hit all 3 sections. Bucket categorization (Added vs Changed vs Fixed) still benefits from sharper prompts. | Multilingual nuance — use `gemma3:4b` or `gemma4:31b-mlx` for that. | **~2 s warm, ~5 s cold** |
| `gemma3:4b` | Multilingual translation **only**. Empirically drops format constraints and hallucinates list contents on English structured-prose prompts (e.g. dropped one item from a 5-item enum, ignored requested section headers). Reserve for: translating short copy, classifying multilingual text. | English structured prose, strict-format outputs, anything where missing one item is a real bug. | ~10 s |

**Deliberate lane — built-in CoT, 30s–3min per call. Use only when quality matters more than wall-clock.**

| Model | Best for | Avoid for | Cold latency |
|---|---|---|---|
| `gemma4:31b-mlx` | Multilingual / translation / classification with nuance. | Heavy coding — weaker than Qwen for code. | ~31 s |
| `deepseek-r1:14b` | Reasoning, math, structured decomposition where output is cheaply verifiable. Heavy chain-of-thought is the point. | Production prose, hallucination-sensitive output, anything time-sensitive. | ~40 s |
| `qwen3.5:35b-mlx` | Highest-quality local code generation. Built-in CoT — thinks before answering even simple prompts. | Anything latency-sensitive. Not a "-coder" variant, but base Qwen3.5 is still strong at code. | ~3 min 10 s |

Rule of thumb: stay in the fast lane unless you have a specific reason (hard reasoning step, code quality short, multilingual nuance) to pay the latency cost. For local code work, `qwen2.5-coder:7b` is ~48× faster than `qwen3.5:35b-mlx` on simple prompts and produces equivalent output. Always verify local-model output before acting on it — they hallucinate file paths and APIs more readily than Claude models.

### Decision order

1. Is the data **sensitive** (cannot leave the machine) or are we **offline**? → local Ollama, fast lane (pick model from table). Hard constraint, comes first.
2. Is this a **bulk batch** (hundreds–thousands of similar calls) where total cost matters more than wall-clock per item? → local fast lane (`llama3.2:3b` for classification, `qwen2.5-coder:7b` for code, `qwen2.5:7b` for general prose, `gemma3:4b` for multilingual). ~5–10 s/call vs Haiku's ~1 s/call, but $0 vs metered.
3. Otherwise, can **Haiku** do it correctly with a one-shot prompt? → Haiku subagent. Still the throughput winner for low-volume work.
4. If not, can **Sonnet** do it given a clear spec? → write the spec on the flagship model, then hand off to Sonnet.
5. Need deeper reasoning, multilingual nuance, or top local code quality? → local **deliberate lane** (`deepseek-r1:14b`, `gemma4:31b-mlx`, `qwen3.5:35b-mlx`). Pay the 30s–3min latency for the quality bump.
6. Otherwise → **handle inline on the flagship model**.

### Reporting agent activity in turn summaries

When the executive agent delegates to subagents (`Agent` tool, `ollama run`, or a Skill that fans out), the end-of-turn summary **must** include a per-agent line:

- **Who**: subagent type + model — e.g. `Explore (Sonnet)`, `Plan (flagship)`, `local qwen2.5-coder:7b`.
- **What**: one-phrase description of the task.
- **Cost signal**: approximate token usage for Anthropic agents (input + output + internal tool loops), or wall-clock seconds for local models.

The `Agent` tool does **not** return exact token counts to the parent. Estimate from prompt + response length plus a ~3–10× multiplier for internal tool-use loops (file reads, greps, web fetches add up fast). When unsure, write `~Nk tokens (est.)` rather than inventing precision.

This makes cost tracking and quality regressions visible across sessions.

## Project Orientation

- This repository is the Arbor agent marketplace/protocol app.
- The primary user-facing app is the root Next.js app, started with `npm run dev`.
- If port `3000` is already in use, Next.js may choose another port such as `3001`; use the port printed by the dev server.
- The `my-app/` directory is a separate Convex React/Vite template-style app. Do not assume it is the main Arbor site unless the user specifically points you there.
- `CLAUDE.md`, when present, should be checked for agent-facing project notes. At the time this file was written, it mirrors the Convex block below.

## Expected Workflow

- Read the existing code and local conventions before changing behavior.
- Prefer small, targeted edits that preserve the product direction already in the repository.
- Use `rg` / `rg --files` for search.
- Use `apply_patch` for manual file edits.
- When adding code that requires a new API key or provider secret, update `docs/api-keys.md` in the same change. Never include real secret values.
- Do not revert or overwrite user changes unless the user explicitly asks.
- When changing frontend behavior, run the local app and verify the actual browser experience.
- After meaningful frontend work, use the in-app Browser plugin for local site checks rather than only relying on static inspection.

## Local Commands

- Install dependencies: `npm install`
- Run the main app: `npm run dev`
- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Test: `npm test`
- Lint: `npm run lint`
- Run Convex locally: `npm run convex:dev`
- Run Convex once/codegen check: `npm run convex:once`

## Browser / E2E Checks

- Use the in-app Browser plugin when the user asks to open, inspect, test, click through, screenshot, or perform an end-to-end check of the local site.
- For local Arbor checks, start from the root Next.js app URL, usually `http://localhost:3000` or the fallback port printed by `npm run dev`.
- Verify the visible UI after each meaningful action with a DOM snapshot or screenshot.
- For signup/login flows, use disposable test credentials only.
- Creating a real account in Clerk/AuthKit or another auth provider is a persistent external side effect. If the user has not already explicitly approved account creation with the specific test data, pause immediately before the final submit and ask for confirmation.
- When the user asks for an agent-specialist response, complete enough of the flow to post or submit a task to the specialists and confirm that at least one visible response, bid, recommendation, plan, or delivery appears.
- Report blockers clearly, including auth verification, missing environment variables, Convex codegen/deployment mismatch, or provider-side rate limits.

## Auth And External Services

- The root app uses Clerk for auth and Convex for backend state.
- Development auth keys are expected in `.env.local`; do not print secrets or copy sensitive env values into responses.
- Do not create, delete, or mutate external resources unless the user requested that specific action.
- Do not submit forms containing sensitive data without action-time confirmation unless the initial user request clearly pre-approved the exact data and destination.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Convex-Specific Notes

- Treat `convex/_generated/ai/guidelines.md` as the source of truth for Convex API usage.
- If touching Convex functions, schema, auth, or generated API usage, read the guidelines file first in that turn.
- Use generated `api` and `internal` references correctly; do not invent Convex function paths.
- Convex code changes often require codegen or `npm run convex:once` before browser verification.
- If the browser or server reports `Could not find public function ... Did you forget to run npx convex dev?`, check whether generated Convex code or the deployed/local Convex backend is stale.

## Product Expectations

- Arbor is an agent-specialist marketplace: tasks should flow through task description, specialist shortlist/recommendations, bids or execution planning, judge/review signals, and delivery/payment status where applicable.
- Keep UI copy concrete and product-facing. Avoid adding instructional filler inside the app unless the user specifically asks for onboarding text.
- Specialist responses should be clearly labeled when they are real tool-backed, A2A/MCP-backed, fallback, or mock/synthesized.
- Do not make fallback specialists appear to have live tools when they do not.
