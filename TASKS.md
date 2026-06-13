# Miyohacks Audit Task Backlog

Generated from a nested sub-agent audit of the top-level modules in `/Users/yanzihao/Documents/miyohacks`.

Priorities: P0 critical, P1 high, P2 medium, P3 low. Effort: S under half a day, M one to two days, L larger or cross-cutting.

## P1

- [x] **Fix optional worker secret handling in Azure infra**  
  Module: `infra`  
  Evidence: `infra/azure/main.bicep:13-22`, `infra/azure/main.bicep:48`, `infra/azure/main.bicep:154-227`  
  Problem: optional worker deployment can be created with empty `workerBearerToken` and `azureOpenAIKey`, risking a public Container App with empty secrets.  
  Minimal fix: fail deployment when `workerImage` is set without required auth inputs, or skip worker deployment/secrets unless all required values are present.  
  Effort: S. Confidence: high.

- [x] **Make Convex agent HMAC key rotation deterministic**  
  Module: `convex`  
  Evidence: `convex/agentKeysAdmin.ts:18-43`, `convex/agentKeys.ts:37-45`, `convex/schema.ts:220-225`  
  Problem: provisioning inserts a fresh key but lookup returns the first non-revoked row from a non-unique index, so old active keys can remain usable and lookup can be nondeterministic.  
  Minimal fix: revoke existing active keys before inserting a replacement, or select the newest active key deterministically.  
  Effort: S. Confidence: high.

- [x] **Prevent scaffold-mode Convex provider crashes**  
  Module: `app`  
  Evidence: `app/providers.tsx:6-17`, `app/dashboard/page.tsx:62-64`, `app/agents/page.tsx:18-19`  
  Problem: `Providers` renders children without `ConvexProvider` when `NEXT_PUBLIC_CONVEX_URL` is missing, but routes still call `useQuery`, which can crash.  
  Minimal fix: make Convex mandatory for these routes or render a non-hook fallback before any Convex hook runs.  
  Effort: M. Confidence: high.

- [x] **Harden A2A worker JSON-RPC dispatch against malformed input**  
  Module: `a2a-worker`  
  Evidence: `a2a-worker/server.ts:505-510`, `a2a-worker/server.ts:587-589`, `a2a-worker/server.ts:640-695`  
  Problem: malformed `params` can throw through the request path instead of returning JSON-RPC errors.  
  Minimal fix: validate `params.message.parts` and `params.id`, and wrap dispatch in a top-level guard returning `-32602` or `-32603`.  
  Effort: M. Confidence: high.

- [x] **Restore buildability of the Mastra workspace package**  
  Module: `packages`  
  Evidence: `packages/mastra/package.json:18-27`, `packages/mastra/src/index.ts:17`  
  Problem: `@mastra/core` is an optional peer but imported unconditionally, so `tsc -p packages/mastra/tsconfig.json` fails without it.  
  Minimal fix: add `@mastra/core` as a dev dependency for workspace builds, or make the peer non-optional and document/install it for builds.  
  Effort: S. Confidence: high.

## P2

- [x] **Add body-size limits to the A2A worker request reader**  
  Module: `a2a-worker`  
  Evidence: `a2a-worker/server.ts:479-485`, `a2a-worker/server.ts:640-643`  
  Problem: request bodies are buffered without a size cap.  
  Minimal fix: enforce a maximum request size and reject oversized payloads with a clear JSON-RPC error.  
  Effort: S. Confidence: high.

- [x] **Guard worker Azure resource names**  
  Module: `infra`  
  Evidence: `infra/azure/main.bicep:1-4`, `infra/azure/main.bicep:40-44`  
  Problem: `namePrefix` feeds resource names with Azure length and charset limits but has no validation.  
  Minimal fix: constrain `namePrefix` or derive/clamp names to valid Azure resource identifiers.  
  Effort: S. Confidence: high.

- [x] **Surface discovery refresh failures in agent suggestions**  
  Module: `components`  
  Evidence: `components/AgentSuggestions.tsx:112-119`  
  Problem: discovery can appear successful while refreshed suggestions silently remain stale.  
  Minimal fix: show a non-blocking refresh warning or explicit refresh error state.  
  Effort: S. Confidence: high.

- [x] **Improve external adapter error messages**  
  Module: `lib`  
  Evidence: `lib/hyperspell.ts:138-156`, `lib/mcp-outbound.ts:98-106`, `lib/mcp-outbound.ts:110-115`  
  Problem: file upload reads and MCP SSE parsing can fail with low-context raw errors.  
  Minimal fix: wrap file reads and SSE JSON parsing with errors that include file path, user, URL, and method context.  
  Effort: S. Confidence: high.

- [x] **Handle non-JSON success responses in SDK and CLI clients**  
  Module: `packages`  
  Evidence: `packages/sdk-core/src/index.ts:177-200`, `packages/cli/src/main.mjs:36-55`  
  Problem: helpers assume every successful response is JSON.  
  Minimal fix: check content type/body before parsing and return controlled diagnostics for empty or non-JSON success bodies.  
  Effort: M. Confidence: medium.

- [x] **Add startup config guards to the template app**  
  Module: `my-app`  
  Evidence: `my-app/src/main.tsx:10-18`, `my-app/convex/auth.config.ts:3-20`  
  Problem: missing WorkOS or Convex env vars fail late with opaque startup/auth errors.  
  Minimal fix: validate required env values before creating clients/providers and throw or render a clear config fallback.  
  Effort: M. Confidence: high.

- [x] **Make scripts report missing spawned binaries directly**  
  Module: `scripts`  
  Evidence: `scripts/azure-bootstrap.mjs:72`, `scripts/azure-capacity.mjs:59`, `scripts/azure-off.mjs:61`, `scripts/azure-finetune.mjs:106`, `scripts/azure-finetune-pipeline.mjs:159`  
  Problem: wrappers mostly inspect `status` but not `spawnSync(...).error`, obscuring missing binary/startup failures.  
  Minimal fix: check `result.error` before exit status in each wrapper.  
  Effort: M. Confidence: high.

- [x] **Harden research corpus build scripts against partial failures**  
  Module: `research`  
  Evidence: `research/agent-corpus/scripts/build-a2a-card-sheet.ts:93`, `research/agent-corpus/scripts/compile-protocol-findings.mjs:26`, `research/agent-corpus/scripts/compile-protocol-findings.mjs:178`  
  Problem: one bad fetch or missing/invalid JSON input can abort full corpus builds.  
  Minimal fix: add per-source fetch guards and explicit existence/parse handling with partial-output or clear missing-input failure modes.  
  Effort: S. Confidence: high.

- [x] **Improve example MCP client failure modes**  
  Module: `examples`  
  Evidence: `examples/mcp-client.ts:37`, `examples/mcp-client.ts:52`, `examples/mcp-client.ts:60`, `examples/mcp-client.ts:68`, `examples/mcp-client.ts:99`, `examples/mcp-client.ts:122`  
  Problem: malformed tool payloads, invalid budgets, transport JSON failures, and stuck tasks produce raw crashes or indefinite polling.  
  Minimal fix: validate `max_budget`, catch parse/fetch failures with endpoint and method context, and add a polling timeout or attempt cap.  
  Effort: S. Confidence: high.

- [x] **Add Azure and fine-tune runbook failure guidance**  
  Modules: `docs`, `data`  
  Evidence: `docs/azure-arbor.md:246-269`, `docs/azure-arbor.md:281-320`, `docs/azure-arbor.md:380-420`, `data/fine-tuning/README.md:3-36`  
  Problem: expensive readiness/fine-tune failures lack compact remediation notes.  
  Minimal fix: add short troubleshooting tables or paragraphs for `azure:ready`, `azure:ft`, `azure:devtools:smoke`, `ft:validate`, and `ft:eval`.  
  Effort: S. Confidence: medium.

## P3

- [x] **Clean up or fence mock specialist adapters**  
  Module: `lib`  
  Evidence: `lib/specialists/convex-realtime.ts:1-7`, `lib/specialists/aside-browser.ts:1-6`, `lib/specialists/codex-writer.ts:1-26`  
  Problem: TODO-marked mock specialists are runtime-registered and can look more live than they are.  
  Minimal fix: fence as demo-only, remove from production roster, or replace with real integrations.  
  Effort: M. Confidence: high.

- [x] **Remove orphaned helpers and demo exports**  
  Modules: `convex`, `components`, `my-app`  
  Evidence: `convex/bidProbes.ts:56-64`, `convex/agentKeys.ts:21-34`, `convex/a2aNonces.ts:43-50`, `components/task/AuctionResolution.tsx:68-73`, `my-app/convex/myFunctions.ts:52-78`  
  Problem: unused internal helpers/demo exports add maintenance surface.  
  Minimal fix: remove them, or wire them into real call sites with tests if still intended.  
  Effort: S. Confidence: medium.

- [x] **Decide fate of export-only UI components**  
  Module: `components`  
  Evidence: `components/MCPCard.tsx:7-33`, `components/SpecialistLeaderboard.tsx:9-90`, `components/ui/Eyebrow.tsx:7-20`  
  Problem: components have no main-repo call sites and may be dead UI.  
  Minimal fix: delete retired components or mount them in a live page if still product-relevant.  
  Effort: S-M. Confidence: medium.

- [x] **Refresh stale public docs and metadata**  
  Modules: `app`, `packages`, `docs`, `research`  
  Evidence: `app/api/openapi.json/route.ts:21`, `packages/langchain/README.md:11-13`, `docs/COUNCIL_VISION_PLAN.md:8`, `docs/COUNCIL_VISION_PLAN.md:311-314`, `docs/yc-coding-agent-session.md:1-4`, `research/agent-corpus/README.md:4`, `research/agent-corpus/scripts/load-arbor-import.mjs:1`  
  Problem: docs and public metadata contain stale product names, stale statuses, or contradictory runtime/import claims.  
  Minimal fix: update metadata/prose, add historical banners where appropriate, and align package docs with the exported tool surface.  
  Effort: S. Confidence: high.

- [x] **Fix low-context JSON and env parsing in support tools**  
  Modules: `scripts`, `eval`  
  Evidence: `scripts/evaluate-finetune-model.ts:93`, `eval/router-bench/run.ts:50-68`, `eval/router-bench/live-e2e.ts:48-65`  
  Problem: JSONL and `.env.local` parse/read failures lose path or line context, or are swallowed entirely.  
  Minimal fix: report file and line for JSONL parse failures; ignore only missing `.env.local` and log/rethrow other env read failures.  
  Effort: S. Confidence: high.

- [x] **Remove stale generated data artifacts unless intentional fixtures**  
  Module: `data`  
  Evidence: `data/fine-tuning/README.md:33-36`, `data/fine-tuning/validation-report.json:1-50`, `data/fine-tuning/eval-report.json:1-106`, `data/fine-tuning/azure-finetune-manifest.dryrun.json:1-38`  
  Problem: checked-in generated reports and a dry-run manifest look like disposable local artifacts.  
  Minimal fix: remove or ignore them unless they are documented as fixtures.  
  Effort: S. Confidence: medium.

- [x] **Resolve duplicate or detached research builder entrypoint**  
  Module: `research`  
  Evidence: `package.json:18`, `research/agent-corpus/scripts/build-a2a-card-sheet-v2.mjs:2`  
  Problem: a v2 builder exists but the npm script points to the older TypeScript builder, creating drift risk.  
  Minimal fix: make v2 canonical and wire it into `package.json`, or archive/remove it.  
  Effort: S. Confidence: medium.

- [x] **Tighten protocol and UI polish issues**  
  Modules: `a2a-worker`, `components`, `scripts`, `eval`, `infra`  
  Evidence: `a2a-worker/server.ts:74-79`, `a2a-worker/server.ts:653-668`, `components/MCPCard.tsx:30-33`, `scripts/azure-local-env.mjs:243`, `eval/router-bench/tasks.ts:21`, `infra/azure/main.example.bicepparam:8-11`  
  Problem: minor dead branches, unchecked clipboard writes, unused benchmark metadata, unenforced JSON-RPC version, and inert example params create avoidable noise.  
  Minimal fix: validate or remove unused fields/branches, add clipboard error handling, and clarify example params.  
  Effort: S. Confidence: medium.

## Module Coverage

- `app`: audited by parent module agent plus child proposal pass.
- `components`: audited by parent module agent plus child proposal pass.
- `convex`: audited by parent module agent plus child proposal pass; Convex guidelines were read first.
- `lib`: audited by parent module agent plus child proposal pass.
- `packages`: audited by parent module agent plus child proposal pass.
- `a2a-worker`: audited by parent module agent plus child proposal pass.
- `my-app`: audited by parent module agent plus child proposal pass; local app notes were read.
- `scripts`: audited by parent module agent plus child proposal pass.
- `infra`: audited by parent module agent plus child proposal pass.
- `docs`: audited by parent module agent plus child proposal pass.
- `eval`: audited by parent module agent plus child proposal pass.
- `data`: audited by parent module agent plus child proposal pass.
- `examples`: audited by parent module agent plus child proposal pass.
- `research`: audited by parent module agent plus child proposal pass.

