# Arbor End-to-End Next Steps

Updated: 2026-06-13

## Current Run

- Convex validation passed with `npx convex dev --once`.
- TypeScript passed with `npm run typecheck`.
- Unit tests passed with `npm test`.
- Dashboard Browser check passed on `http://localhost:3001/dashboard` at desktop and mobile widths: Hive payouts/review sections hydrated, no console errors, no horizontal overflow.
- Live hive E2E posted task `js760t2pmyf9tg9bhq5wsjj1p188j211` and reached terminal status, but failed 5/9 assertions.

The E2E failure was market-quality related, not a planner crash. The DAG planned and routed one node, but the child task `js77k6nttzrdzjg6716st87kx988j7sj` received zero accepted bids. Six A2A agents were probed successfully, then all six bids were declined as implausible or off-task, so evaluation, scratchpad writes, and root synthesis never ran.

## Registered Agent Snapshot

- Registered agents: 154.
- Discovered A2A agents: 119.
- Eval-passed discovered A2A agents: 35.
- Eval-failed discovered A2A agents: 84.
- Main discovered failure buckets:
  - No live endpoint or skipped live endpoint: 55.
  - Protocol/JSON/task-shape mismatch: 27.
  - Auth or API-key blocker: 2 explicit current failures.
- Static/catalog key-backed agents observed: 17, including Nia, Reacher, Stripe, Notion, Vercel, Linear, Supabase, Figma, Sentry, Atlassian, Neon, GitHub, Devin, Tensorlake, InsForge, Hyperspell, and v0.

## API-Key Work

The designated key tracker is `docs/api-keys.md`. It now covers:

- Core hive model keys and routing switches.
- Convex/app runtime variables.
- Azure OpenAI, Foundry, and Azure provisioning variables.
- Stripe checkout/Connect/settlement variables.
- Static specialist and catalog MCP provider keys.
- A2A endpoint variables and dynamic `ARBOR_A2A_KEY_*` outbound auth keys for protected registered agents.

## Plan To Make Every Registered Agent Work End-To-End

1. Build an agent readiness matrix.
   - Persist one row per registered agent with source, transport, endpoint, auth mode, required key env, latest probe status, latest bid status, execution status, and owner.
   - Add a dashboard filter for `ready`, `needs_key`, `protocol_mismatch`, `endpoint_down`, `mock_only`, and `needs_owner_action`.

2. Separate readiness probes from bid quality.
   - Keep transport probes strict for protocol compatibility.
   - Add a second evaluator for bid fitness that records why a capable endpoint declined or produced unusable bids.
   - Do not mark an agent globally bad because it is bad for one task class.

3. Add task-class routing guarantees.
   - For each task class, require at least one known-good fallback specialist before creating a hive child task.
   - For general reasoning tasks, include an Arbor-owned baseline worker or internal synthesis lane so the DAG can always complete.
   - Route narrow A2A specialists only when their capabilities match the node, not merely because they are eval-passed.

4. Fix A2A interoperability adapters.
   - Support common observed response variants around `message/send`, task `kind`, artifacts, history, and `input-required` states.
   - Record endpoint-specific adapter notes without weakening the canonical A2A path.
   - Re-probe failed agents after adapter changes and keep the before/after evidence.

5. Close credential gaps.
   - Set required static provider keys in the correct runtime: `.env.local` for Next, Convex env for Convex actions.
   - Provision dynamic external A2A keys with `a2aOutboundKeys:setKey` or the admin A2A key route.
   - Keep the tracker updated whenever a new agent card advertises protected auth.

6. Make no-bid failure recoverable.
   - If all invited agents decline, escalate to an internal fallback agent, broaden the shortlist once, or synthesize a "could not route" deliverable with concrete reasons.
   - Always write a scratchpad diagnostic entry and root result text for terminal hive failures.

7. Add per-agent smoke tasks.
   - Generate one minimal task per registered agent from its capabilities.
   - Verify probe, bid, execution/delivery, judge/eval, scratchpad, settlement eligibility, and visible dashboard state.
   - Store results so regressions are attributable to code, credentials, endpoint downtime, or owner behavior.

8. Promote payments and settlement only after delivery is stable.
   - Keep simulated escrow as the default until each live agent has a passing smoke task.
   - Enable Stripe checkout per agent only after delivery, dispute, and payout accounting are proven on non-sensitive test tasks.

## Immediate Implementation Order

1. Add the readiness matrix query and dashboard table.
2. Add a guaranteed Arbor-owned fallback lane for general hive nodes.
3. Change hive terminal failure handling so no-bid paths still write scratchpad diagnostics and root result text.
4. Add an E2E fixture that routes to a deterministic local/mock or Arbor-owned worker, then keep the live external-agent E2E as a separate canary.
5. Build the per-agent smoke runner and run it against the 154 currently registered agents.
