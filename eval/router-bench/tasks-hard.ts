/**
 * HARD task set — constraint-specific goals where several near-duplicate
 * specialists are plausible but only ONE actually satisfies the constraint.
 *
 * Pool under test = the 10 catalog specialists + the ~12 distractors. A keyword
 * or embedding baseline tends to match the obvious domain word ("payments",
 * "database", "deploy") and pick a near-duplicate; only a strategy that reasons
 * about the *specific* constraint (merchant-of-record, MySQL, v0 generation,
 * Connect-style split payouts) gets these right.
 *
 * The gap between the LLM router and the baselines ON THIS SUITE is the real
 * evidence of routing IP.
 */

import type { RouterTask } from "./tasks";

export const HARD_TASKS: RouterTask[] = [
  {
    id: "h-connect-payouts",
    goal: "Onboard individual sellers with their own payout accounts and split each marketplace sale between the seller and us automatically.",
    domain: "payments",
    gold_specialist_ids: ["stripe-payments"], // Connect-style split payouts + onboarding
    gold_capability: "stripe-connect-onboarding",
    adversarial: true,
  },
  {
    id: "h-merchant-of-record",
    goal: "Sell our SaaS worldwide and have the payment provider act as merchant of record so they handle global sales tax and VAT for us.",
    domain: "payments",
    gold_specialist_ids: ["lemonsqueezy-payments"],
    gold_capability: "merchant-of-record",
    adversarial: true,
  },
  {
    id: "h-pos",
    goal: "Take card payments in person at our pop-up shop with a point-of-sale terminal and sync the catalog.",
    domain: "payments",
    gold_specialist_ids: ["square-payments"],
    gold_capability: "pos",
    adversarial: true,
  },
  {
    id: "h-mysql-serverless",
    goal: "We need a MySQL-compatible serverless database with safe schema branching for our app.",
    domain: "database",
    gold_specialist_ids: ["planetscale-db"],
    gold_capability: "mysql",
    adversarial: true,
  },
  {
    id: "h-pg-branching",
    goal: "Give every pull request its own isolated Postgres branch for preview environments.",
    domain: "database",
    gold_specialist_ids: ["neon-postgres"],
    gold_capability: "branch-create",
    adversarial: true,
  },
  {
    id: "h-v0-generate",
    goal: "Generate our React landing-page UI from a text prompt and deploy it.",
    domain: "deploy",
    gold_specialist_ids: ["vercel-deploy"], // v0 generation
    gold_capability: "v0-generate",
    adversarial: true,
  },
  {
    id: "h-static-forms",
    goal: "Host our static marketing site with built-in form handling and A/B split testing, no backend.",
    domain: "deploy",
    gold_specialist_ids: ["netlify-hosting"],
    gold_capability: "split-testing",
    adversarial: true,
  },
  {
    id: "h-long-running-svc",
    goal: "Host a long-running Node web service with background workers and cron jobs plus a managed database.",
    domain: "deploy",
    gold_specialist_ids: ["render-hosting"],
    gold_capability: "background-workers",
    adversarial: true,
  },
  {
    id: "h-open-source-design",
    goal: "We want an open-source, self-hostable design tool for our mockups so nothing leaves our infra.",
    domain: "design",
    gold_specialist_ids: ["penpot-design"],
    gold_capability: "open-source-design",
    adversarial: true,
  },
  {
    id: "h-infra-metrics",
    goal: "Monitor infrastructure metrics, host health, and APM dashboards across our whole server fleet.",
    domain: "observability",
    gold_specialist_ids: ["datadog-monitoring"],
    gold_capability: "infra-metrics",
    adversarial: true,
  },
  {
    id: "h-tracing-slo",
    goal: "Debug tail latency with high-cardinality distributed tracing and track SLOs.",
    domain: "observability",
    gold_specialist_ids: ["honeycomb-observability"],
    gold_capability: "distributed-tracing",
    adversarial: true,
  },
  {
    id: "h-frontend-errors",
    goal: "Track frontend JavaScript errors with source maps and watch release health after each deploy.",
    domain: "observability",
    gold_specialist_ids: ["sentry-observability"],
    gold_capability: "release-tracking",
    adversarial: true,
  },
  {
    id: "h-git-native-issues",
    goal: "Use a git-native issue tracker that lives right alongside our code in the repository.",
    domain: "issues",
    gold_specialist_ids: ["github-engineering"],
    gold_capability: "create-issue",
    adversarial: true,
  },
  {
    id: "h-relational-doc",
    goal: "Build a team doc that combines write-ups with relational tables and automations in one surface.",
    domain: "docs",
    gold_specialist_ids: ["coda-docs"],
    gold_capability: "relational-tables",
    adversarial: true,
  },
];
