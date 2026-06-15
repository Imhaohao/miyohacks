# Global Agent Behavior

## Model Routing (Delegation Rules)

Cost ratio: **Opus ≈ 5× Sonnet ≈ 60× Haiku ≈ $0 local Ollama**.
Default is to push work down the cost ladder. Opus keeps only what genuinely needs it.

### Opus — keep only:
- Multi-file refactors where a wrong call is hard to undo
- Architecture decisions and ambiguous specs
- Routing decisions (i.e. deciding which model to use)
- Debugging that may span unfamiliar files
- Auth, schema migrations, money/account flows

### Sonnet — delegate when: `Agent(model: "sonnet", ...)`
- Single-file or clearly scoped code changes
- Writing or updating tests for a known module
- Code review of a small diff
- Mechanical refactors once the plan is decided

### Haiku — delegate when: `Agent(model: "haiku", ...)`
- File/symbol lookups ("where is X defined")
- One-line edits, commit messages, PR descriptions
- Summarization, classification, format conversions
- Prose polish where the substance is already right
- **Do not use for multi-step reasoning**

### Local Ollama — use when data is sensitive or offline:
- `qwen2.5-coder:7b` — default local code worker (~4 s)
- `qwen2.5:7b` — prose, summaries, changelogs (~2 s warm)
- `llama3.2:3b` — bulk classification, one-word answers (~10 s)
- `deepseek-r1:14b` — hard reasoning, math (~40 s)
- Stay in the fast lane unless you have a specific reason to pay latency

### Decision order (run top to bottom, stop at first match):
1. Data sensitive or offline? → local fast lane
2. Bulk batch (100s of calls)? → local fast lane
3. Haiku sufficient with a one-shot prompt? → Haiku subagent
4. Clear spec and single file? → Sonnet subagent
5. Hard reasoning or multilingual? → local deliberate lane
6. Otherwise → Opus inline

### Mandatory rules:
- Every multi-step plan **must** end with a delegation table mapping each task to a model. A plan that assigns every task to Opus is a bug — rewrite the plan before starting.
- Parallelize independent lookups: launch multiple Haiku/Sonnet subagents in one message rather than running them sequentially on Opus.
- End-of-turn summaries must list each subagent used: **who** (model), **what** (one phrase), **cost** (est. tokens or wall-clock seconds for local).

## Build Plans for Large Tasks
Before starting any multi-task build (e.g. 'build tasks 7-14'), write the full plan and checkpoint progress to a file (e.g. PROGRESS.md) after each completed sub-task so work survives session limits.

## Verification
After implementing any module, always run typecheck and tests before declaring it done; match existing patterns (e.g. wrap top-level await in a main()).

## Shell Conventions
Use ripgrep with -g for globs (not --include); prefer rg over find/grep. Clear stale Next.js build caches (.next) when seeing runtime module errors.

## Core Principles

- Never use emojis in any output, code, comments, or messages.

## Commit Authorship

- Never add Claude as a commit author.
- Always commit using the default git user settings.

## Documentation Style

- Never create `.md` files unless explicitly instructed.
- Be extremely concise — engineers scan, they don't read.
- Prefer examples over prose.
- Assume technical competence; skip obvious explanations.
- Front-load critical info — warnings and key concepts first.
- Default to 1–2 sentence explanations. Only expand when complexity requires it.
