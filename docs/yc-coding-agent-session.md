# Coding Agent Session: Moving Arbor From Simulated Escrow to Real Stripe Payments

> Historical session note. This is a retrospective artifact, not the current
> setup or operations guide.

The coding-agent session I am most proud of was the one where Codex turned Arbor's payment flow from a simulated demo ledger into a real, off-by-default Stripe Connect path.

Arbor is an agent-specialist marketplace: a buyer posts a task, specialists bid in an auction, a winner executes the work, and a judge decides whether the work should be accepted. Before this session, the product could show escrow-like state in Convex, but no real payment boundary existed. That was a problem because the marketplace story depends on answering a concrete question: when an AI agent wins work, who gets paid, when, and why?

The goal I gave Codex was intentionally constrained: implement the smallest real Stripe integration that moves us past simulated payments, keep external side effects disabled by default, and leave a clear activation checklist. The agent first traced the existing Convex auction and escrow lifecycle, checked the current Stripe Connect/Checkout/manual-capture docs, and then proposed a design that fit the product instead of bolting on a generic checkout button.

The core implementation was:

- Add `requires_payment` to the task lifecycle, plus Stripe payment status fields in the Convex schema.
- Add a Convex payment bridge in `convex/payments.ts` for connected-account records, checkout attachment, authorization, capture, and cancellation.
- Change `convex/auctions.ts` so real-payment mode pauses after auction resolution. In normal demo mode, execution still starts immediately. In `ARBOR_PAYMENTS_MODE=stripe_checkout`, Arbor marks payment required, waits for Stripe authorization, then resumes execution only after Stripe reports funds are capturable.
- Add server-side Stripe routes:
  - `app/api/stripe/connect/onboard/route.ts` for Connect Express onboarding.
  - `app/api/stripe/checkout/task/route.ts` for manual-capture Checkout Sessions with destination charges and platform fees.
  - `app/api/stripe/webhook/route.ts` for verified webhook handling of account readiness, authorization, capture, and cancellation events.
- Add `components/task/TaskPaymentPanel.tsx` so the task page visibly stops at the payment checkpoint and lets the buyer open Stripe Checkout.
- Update `.env.example`, `package.json`, and the README so the real-money path is explicit, documented, and disabled unless the operator opts in.

What made the session strong was the agent's handling of product and safety constraints. It did not just "add Stripe." It preserved the existing hackathon/demo lane, put all real side effects behind `ARBOR_PAYMENTS_MODE=stripe_checkout`, returned explicit `stripe_disabled` responses when disabled, used Stripe webhook signature verification, and kept Convex as the source of truth for task and escrow state. It also chose manual capture instead of immediate capture, which maps much better to an agent marketplace: authorize before execution, capture only after accepted work, cancel on rejection or failure.

The agent also worked through the cross-stack failure modes that usually make these integrations brittle. It regenerated Convex API bindings, fixed narrow type-inference issues surfaced by codegen, added clear disabled-state behavior to each Stripe route, updated the UI status model, and documented the exact manual activation steps for Stripe Connect and webhooks.

The outcome was a real, auditable payment boundary in Arbor:

- The auction can now pause for buyer authorization instead of pretending escrow is real.
- Seller onboarding and buyer checkout are represented as concrete Stripe and Convex state transitions.
- Accepted work captures the authorized PaymentIntent; rejected or failed work cancels it.
- Operators can keep the app in no-side-effect demo mode by default and switch on the Stripe lane only after configuring the required env vars and webhook events.

Verification from the session:

- `npx convex codegen` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed.
- A local smoke check confirmed the home page rendered and the disabled Stripe route returned `503 stripe_disabled`, so no Stripe side effects ran during development.

This is the session I would show because it is a realistic example of how I want to use coding agents: not as autocomplete, but as an engineer that can read an existing system, respect side-effect boundaries, integrate a real external service, update backend state, UI, docs, and tests, and leave the product in a better operational state than it started.
