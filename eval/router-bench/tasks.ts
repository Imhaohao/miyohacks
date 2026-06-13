/**
 * Router benchmark task set.
 *
 * Each task is a natural-language goal with GOLD labels: the catalog specialist
 * id(s) that genuinely fit, plus the capability the right agent must have.
 *
 * Honesty rules for labels (no seeded "evidence"):
 *   - Gold = a specialist whose real capabilities/endpoint actually satisfy the
 *     goal. Correctness = "did the strategy pick a capable specialist," not
 *     "did it match a brand keyword."
 *   - Many goals deliberately AVOID the sponsor's name to test capability
 *     matching over brand-keyword matching.
 *   - Some goals are intentionally adversarial / cross-domain (e.g. "checkout is
 *     failing" is a payments task, not an observability task) — the council
 *     flagged cross-domain bias as the failure mode that matters.
 *   - Some goals have multiple acceptable golds (postgres → Supabase or Neon).
 *
 * Pool under test = the 10 real HTTP MCP servers in lib/specialists/catalog.ts.
 */

export interface RouterTask {
  id: string;
  goal: string;
  domain: string;
  /** Catalog agent_id(s) that correctly satisfy the goal. */
  gold_specialist_ids: string[];
  /** Representative capability used by benchmark reports and fine-tune data. */
  gold_capability: string;
  /** True when the goal is a cross-domain / brand-free trap. */
  adversarial?: boolean;
}

export const ROUTER_TASKS: RouterTask[] = [
  {
    id: "pay-connect",
    goal: "I run a marketplace and need to onboard sellers so they can receive payouts, and split payments between them and us.",
    domain: "payments",
    gold_specialist_ids: ["stripe-payments"],
    gold_capability: "stripe-connect-onboarding",
    adversarial: true,
  },
  {
    id: "pay-subscriptions",
    goal: "Add monthly subscription billing to our product and let support process refunds.",
    domain: "payments",
    gold_specialist_ids: ["stripe-payments"],
    gold_capability: "subscription-management",
  },
  {
    id: "pay-checkout-failing",
    goal: "Customers say checkout is failing and they can't complete payment — fix the payment flow.",
    domain: "payments",
    gold_specialist_ids: ["stripe-payments"],
    gold_capability: "create-payment-link",
    adversarial: true,
  },
  {
    id: "pay-refund",
    goal: "A customer is requesting a refund for their last order — process it.",
    domain: "payments",
    gold_specialist_ids: ["stripe-payments"],
    gold_capability: "refunds",
  },
  {
    id: "docs-wiki",
    goal: "Store our campaign briefs in a searchable team wiki and create new pages for each launch.",
    domain: "docs",
    gold_specialist_ids: ["notion-workspace"],
    gold_capability: "doc-creation",
  },
  {
    id: "code-fix-pr",
    goal: "Open a pull request that fixes a failing unit test in our repository.",
    domain: "code",
    gold_specialist_ids: ["github-engineering"],
    gold_capability: "open-pull-request",
  },
  {
    id: "code-ci-review",
    goal: "Trigger our CI pipeline and review the currently open pull request.",
    domain: "code",
    gold_specialist_ids: ["github-engineering"],
    gold_capability: "actions-trigger",
  },
  {
    id: "issues-triage",
    goal: "Triage incoming bug reports into sprints and track cycle progress for the team.",
    domain: "issues",
    gold_specialist_ids: ["linear-issues", "atlassian-suite"],
    gold_capability: "triage",
  },
  {
    id: "issues-roadmap",
    goal: "Manage our product roadmap and keep project status up to date.",
    domain: "issues",
    gold_specialist_ids: ["linear-issues", "atlassian-suite"],
    gold_capability: "project-status",
  },
  {
    id: "deploy-landing",
    goal: "Generate a landing page, deploy it, and configure a custom domain plus environment variables.",
    domain: "deploy",
    gold_specialist_ids: ["vercel-deploy"],
    gold_capability: "deployment-status",
  },
  {
    id: "deploy-edge-logs",
    goal: "Deploy my Next.js app to the edge and check the build logs for failures.",
    domain: "deploy",
    gold_specialist_ids: ["vercel-deploy"],
    gold_capability: "log-search",
  },
  {
    id: "backend-auth-storage",
    goal: "Spin up a backend with Postgres, user authentication, and file storage for a new app.",
    domain: "backend",
    gold_specialist_ids: ["supabase-backend"],
    gold_capability: "auth-user-management",
  },
  {
    id: "backend-login",
    goal: "Add login and user account management to our web app.",
    domain: "backend",
    gold_specialist_ids: ["supabase-backend"],
    gold_capability: "auth-user-management",
    adversarial: true,
  },
  {
    id: "db-branch-migrate",
    goal: "Create a database branch and run a schema migration on serverless Postgres.",
    domain: "database",
    gold_specialist_ids: ["neon-postgres"],
    gold_capability: "branch-create",
  },
  {
    id: "db-sql-query",
    goal: "Run a SQL query against our Postgres database to pull last week's signups.",
    domain: "database",
    gold_specialist_ids: ["neon-postgres", "supabase-backend"],
    gold_capability: "sql-query",
  },
  {
    id: "obs-error-spike",
    goal: "Find the spike in production errors and trace the slow request behind it.",
    domain: "observability",
    gold_specialist_ids: ["sentry-observability"],
    gold_capability: "trace-analysis",
  },
  {
    id: "obs-alert-config",
    goal: "Configure alerting so we get paged on performance regressions in production.",
    domain: "observability",
    gold_specialist_ids: ["sentry-observability"],
    gold_capability: "alert-config",
    adversarial: true,
  },
  {
    id: "atlassian-sprint",
    goal: "Plan our sprint in Jira and update the runbook in Confluence.",
    domain: "atlassian",
    gold_specialist_ids: ["atlassian-suite"],
    gold_capability: "sprint-planning",
  },
  {
    id: "design-tokens",
    goal: "Pull the design tokens and components out of our mockups.",
    domain: "design",
    gold_specialist_ids: ["figma-design"],
    gold_capability: "token-export",
  },
  {
    id: "design-system",
    goal: "We need wireframes and a consistent design system for our new UI.",
    domain: "design",
    gold_specialist_ids: ["figma-design"],
    gold_capability: "component-search",
    adversarial: true,
  },
  {
    id: "docs-postmortem",
    goal: "Write up the incident postmortem in our team knowledge base.",
    domain: "docs",
    gold_specialist_ids: ["notion-workspace", "atlassian-suite"],
    gold_capability: "doc-creation",
    adversarial: true,
  },
  {
    id: "code-search-issue",
    goal: "Search our repositories for where the bug lives and file an issue for it.",
    domain: "code",
    gold_specialist_ids: ["github-engineering"],
    gold_capability: "repo-search",
  },
];
