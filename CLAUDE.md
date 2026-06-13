Guidance for AI agents working in `/Users/yanzihao/Documents/miyohacks`.

Model routing, parallel subagents, and local-model delegation live in `.claude/setting.json` — not duplicated here. See `AGENTS.md` for the full delegation reference if that file is unavailable.

## Project Orientation

- This repository is the Arbor agent marketplace/protocol app.
- The primary user-facing app is the root Next.js app, started with `npm run dev`.
- If port `3000` is already in use, Next.js may choose another port such as `3001`; use the port printed by the dev server.
- The `my-app/` directory is a separate Convex React/Vite template-style app. Do not assume it is the main Arbor site unless the user specifically points you there.

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
