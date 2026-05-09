/**
 * Curated catalog of real, production HTTP MCP servers we know about.
 *
 * The discover flow consults this catalog first because:
 *   - the URLs are stable and verified by hand
 *   - matching is instant (no extra network round-trip)
 *   - we know which auth env-var each endpoint expects
 *
 * Sources (May 2026, all hosted streamable-HTTP MCP):
 *   - https://mcp.stripe.com               — Stripe payments / Connect
 *   - https://mcp.notion.com/mcp           — Notion workspace
 *   - https://api.githubcopilot.com/mcp/   — GitHub repos / issues / PRs
 *   - https://mcp.linear.app/mcp           — Linear issues / projects
 *   - https://mcp.vercel.com               — Vercel + v0 generation
 *   - https://mcp.supabase.com/mcp         — Supabase Postgres / auth / storage
 *   - https://mcp.sentry.dev/mcp           — Sentry errors / performance
 *   - https://mcp.atlassian.com/v1/mcp     — Jira + Confluence
 *   - https://mcp.neon.tech/mcp            — Neon serverless Postgres
 *   - https://mcp.figma.com/mcp            — Figma files / comments
 *
 * Adding an entry: bare minimum is `mcp_endpoint` + `capabilities` +
 * `domain_tags`. The discover flow will register a SpecialistConfig from
 * this entry on demand; capabilities surface in suggest scoring.
 */

export interface CatalogEntry {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  /**
   * Human-language tags the LLM matcher uses to map a free-form goal to
   * this entry. Be generous — multiple synonyms is good ("design", "ui",
   * "landing page", "frontend").
   */
  domain_tags: string[];
  mcp_endpoint: string;
  mcp_api_key_env?: string;
  homepage_url: string;
  /** Honest cost prior; refined by the registry once the agent gets bids. */
  cost_baseline: number;
}

export const MCP_CATALOG: CatalogEntry[] = [
  {
    agent_id: "stripe-payments",
    display_name: "stripe-payments",
    sponsor: "Stripe",
    one_liner: "Real payments, Connect onboarding, subscriptions, refunds.",
    capabilities: [
      "create-payment-link",
      "stripe-connect-onboarding",
      "subscription-management",
      "refunds",
      "webhook-config",
    ],
    domain_tags: [
      "payments",
      "checkout",
      "billing",
      "subscriptions",
      "stripe",
      "connect",
      "marketplace payouts",
      "refund",
      "invoice",
    ],
    mcp_endpoint: "https://mcp.stripe.com",
    mcp_api_key_env: "STRIPE_API_KEY",
    homepage_url: "https://stripe.com/",
    cost_baseline: 0.5,
  },
  {
    agent_id: "notion-workspace",
    display_name: "notion-workspace",
    sponsor: "Notion",
    one_liner: "Read, edit, and search your Notion workspace.",
    capabilities: [
      "notion-page-ops",
      "notion-database-query",
      "notion-search",
      "doc-creation",
    ],
    domain_tags: [
      "notion",
      "docs",
      "wiki",
      "knowledge base",
      "notes",
      "campaign brief storage",
    ],
    mcp_endpoint: "https://mcp.notion.com/mcp",
    mcp_api_key_env: "NOTION_API_KEY",
    homepage_url: "https://www.notion.so/",
    cost_baseline: 0.4,
  },
  {
    agent_id: "github-engineering",
    display_name: "github-engineering",
    sponsor: "GitHub",
    one_liner: "GitHub repos, issues, PRs, and Actions runs.",
    capabilities: [
      "repo-search",
      "create-issue",
      "open-pull-request",
      "review-pr",
      "actions-trigger",
    ],
    domain_tags: [
      "github",
      "code",
      "repo",
      "pull request",
      "issue tracker",
      "ci",
      "engineering",
    ],
    mcp_endpoint: "https://api.githubcopilot.com/mcp/",
    mcp_api_key_env: "GITHUB_TOKEN",
    homepage_url: "https://github.com/",
    cost_baseline: 0.55,
  },
  {
    agent_id: "linear-issues",
    display_name: "linear-issues",
    sponsor: "Linear",
    one_liner: "Issue tracking, projects, cycles, and triage workflows.",
    capabilities: [
      "create-issue",
      "update-issue",
      "project-status",
      "triage",
      "cycle-planning",
    ],
    domain_tags: [
      "linear",
      "issues",
      "tickets",
      "tasks",
      "project management",
      "sprint",
      "roadmap",
    ],
    mcp_endpoint: "https://mcp.linear.app/mcp",
    mcp_api_key_env: "LINEAR_API_KEY",
    homepage_url: "https://linear.app/",
    cost_baseline: 0.4,
  },
  {
    agent_id: "vercel-deploy",
    display_name: "vercel-deploy",
    sponsor: "Vercel",
    one_liner: "Vercel projects, deployments, env vars, and v0 generation.",
    capabilities: [
      "v0-generate",
      "deployment-status",
      "env-var-management",
      "domain-config",
      "log-search",
    ],
    domain_tags: [
      "vercel",
      "v0",
      "deploy",
      "frontend",
      "landing page",
      "ui design",
      "hosting",
      "edge",
    ],
    mcp_endpoint: "https://mcp.vercel.com",
    mcp_api_key_env: "VERCEL_TOKEN",
    homepage_url: "https://vercel.com/",
    cost_baseline: 0.6,
  },
  {
    agent_id: "supabase-backend",
    display_name: "supabase-backend",
    sponsor: "Supabase",
    one_liner: "Postgres, auth, storage, and edge functions.",
    capabilities: [
      "postgres-query",
      "auth-user-management",
      "storage-bucket-ops",
      "edge-function-deploy",
    ],
    domain_tags: [
      "supabase",
      "postgres",
      "database",
      "auth",
      "storage",
      "backend",
    ],
    mcp_endpoint: "https://mcp.supabase.com/mcp",
    mcp_api_key_env: "SUPABASE_SERVICE_ROLE_KEY",
    homepage_url: "https://supabase.com/",
    cost_baseline: 0.45,
  },
  {
    agent_id: "sentry-observability",
    display_name: "sentry-observability",
    sponsor: "Sentry",
    one_liner: "Error tracking, releases, and performance traces.",
    capabilities: [
      "issue-search",
      "release-tracking",
      "trace-analysis",
      "alert-config",
    ],
    domain_tags: [
      "sentry",
      "errors",
      "monitoring",
      "observability",
      "incident",
      "debugging",
    ],
    mcp_endpoint: "https://mcp.sentry.dev/mcp",
    mcp_api_key_env: "SENTRY_AUTH_TOKEN",
    homepage_url: "https://sentry.io/",
    cost_baseline: 0.4,
  },
  {
    agent_id: "atlassian-suite",
    display_name: "atlassian-suite",
    sponsor: "Atlassian",
    one_liner: "Jira issues + Confluence docs in one MCP.",
    capabilities: [
      "jira-issue-ops",
      "confluence-page-ops",
      "sprint-planning",
      "doc-search",
    ],
    domain_tags: [
      "atlassian",
      "jira",
      "confluence",
      "issues",
      "wiki",
      "docs",
      "ticketing",
    ],
    mcp_endpoint: "https://mcp.atlassian.com/v1/mcp",
    mcp_api_key_env: "ATLASSIAN_API_TOKEN",
    homepage_url: "https://www.atlassian.com/",
    cost_baseline: 0.5,
  },
  {
    agent_id: "neon-postgres",
    display_name: "neon-postgres",
    sponsor: "Neon",
    one_liner: "Serverless Postgres branches, schemas, and queries.",
    capabilities: [
      "branch-create",
      "sql-query",
      "schema-migrate",
      "connection-pool",
    ],
    domain_tags: [
      "neon",
      "postgres",
      "sql",
      "branching",
      "database",
      "backend",
    ],
    mcp_endpoint: "https://mcp.neon.tech/mcp",
    mcp_api_key_env: "NEON_API_KEY",
    homepage_url: "https://neon.tech/",
    cost_baseline: 0.4,
  },
  {
    agent_id: "figma-design",
    display_name: "figma-design",
    sponsor: "Figma",
    one_liner: "Read Figma files, comments, and design tokens.",
    capabilities: [
      "file-fetch",
      "comment-thread-ops",
      "component-search",
      "token-export",
    ],
    domain_tags: [
      "figma",
      "design",
      "ui",
      "mockup",
      "wireframe",
      "design system",
      "tokens",
    ],
    mcp_endpoint: "https://mcp.figma.com/mcp",
    mcp_api_key_env: "FIGMA_API_TOKEN",
    homepage_url: "https://figma.com/",
    cost_baseline: 0.45,
  },
];
