/**
 * Near-duplicate distractor specialists for HARD mode.
 *
 * The easy suite (10 disjoint domains) is saturated — lexical keyword matching
 * already scores 95%+, so it can't prove a routing moat. Real specialist markets
 * are full of near-duplicates: several payment processors, several Postgres
 * hosts, several design tools. Selection is only hard when many candidates look
 * similar and only one satisfies a specific constraint.
 *
 * These entries are realistic real products with accurate capabilities/tags.
 * (Endpoints are best-known/plausible; the benchmark ranks on description, not
 * by calling them, so endpoint liveness is irrelevant here.) Each is chosen to
 * compete with a catalog entry so HARD tasks have exactly one correct answer
 * that a keyword/embedding baseline will tend to miss.
 */

import type { CatalogEntry } from "../../lib/specialists/catalog";

export const EXTRA_SPECIALISTS: CatalogEntry[] = [
  // ── payments near-duplicates (compete with stripe-payments) ──
  {
    agent_id: "paypal-payments",
    display_name: "paypal-payments",
    sponsor: "PayPal",
    one_liner: "Accept payments, send invoices, and run payouts via PayPal.",
    capabilities: ["checkout", "invoicing", "payouts", "dispute-resolution"],
    domain_tags: ["payments", "paypal", "checkout", "invoices", "payouts"],
    mcp_endpoint: "https://mcp.paypal.com/mcp",
    homepage_url: "https://paypal.com/",
    cost_baseline: 0.5,
  },
  {
    agent_id: "square-payments",
    display_name: "square-payments",
    sponsor: "Square",
    one_liner: "Point-of-sale and online checkout for in-person and web sales.",
    capabilities: ["pos", "checkout", "catalog", "in-person-payments"],
    domain_tags: ["payments", "square", "point of sale", "retail", "in person"],
    mcp_endpoint: "https://mcp.squareup.com/mcp",
    homepage_url: "https://squareup.com/",
    cost_baseline: 0.5,
  },
  {
    agent_id: "lemonsqueezy-payments",
    display_name: "lemonsqueezy-payments",
    sponsor: "Lemon Squeezy",
    one_liner:
      "Merchant of record for SaaS — handles global sales tax and VAT for you.",
    capabilities: [
      "merchant-of-record",
      "saas-subscriptions",
      "global-tax-compliance",
      "license-keys",
    ],
    domain_tags: [
      "payments",
      "saas",
      "merchant of record",
      "sales tax",
      "vat",
      "subscriptions",
    ],
    mcp_endpoint: "https://mcp.lemonsqueezy.com/mcp",
    homepage_url: "https://lemonsqueezy.com/",
    cost_baseline: 0.5,
  },
  // ── database near-duplicates (compete with neon-postgres / supabase) ──
  {
    agent_id: "planetscale-db",
    display_name: "planetscale-db",
    sponsor: "PlanetScale",
    one_liner: "MySQL-compatible serverless database with branching on Vitess.",
    capabilities: ["mysql", "db-branching", "vitess-scale", "online-schema-change"],
    domain_tags: ["database", "mysql", "serverless", "branching", "scale"],
    mcp_endpoint: "https://mcp.planetscale.com/mcp",
    homepage_url: "https://planetscale.com/",
    cost_baseline: 0.45,
  },
  // ── hosting near-duplicates (compete with vercel-deploy) ──
  {
    agent_id: "netlify-hosting",
    display_name: "netlify-hosting",
    sponsor: "Netlify",
    one_liner: "Static + Jamstack hosting with built-in forms and split testing.",
    capabilities: ["static-hosting", "form-handling", "split-testing", "functions"],
    domain_tags: ["hosting", "deploy", "static site", "forms", "jamstack", "split testing"],
    mcp_endpoint: "https://mcp.netlify.com/mcp",
    homepage_url: "https://netlify.com/",
    cost_baseline: 0.5,
  },
  {
    agent_id: "render-hosting",
    display_name: "render-hosting",
    sponsor: "Render",
    one_liner: "Host long-running web services, background workers, and cron jobs.",
    capabilities: [
      "web-services",
      "background-workers",
      "cron-jobs",
      "managed-postgres",
    ],
    domain_tags: ["hosting", "deploy", "long running service", "backend", "workers", "cron"],
    mcp_endpoint: "https://mcp.render.com/mcp",
    homepage_url: "https://render.com/",
    cost_baseline: 0.5,
  },
  // ── design near-duplicates (compete with figma-design) ──
  {
    agent_id: "penpot-design",
    display_name: "penpot-design",
    sponsor: "Penpot",
    one_liner: "Open-source, self-hostable design and prototyping tool.",
    capabilities: ["open-source-design", "prototyping", "components", "self-hostable"],
    domain_tags: ["design", "open source", "self-hostable", "ui", "mockup", "prototyping"],
    mcp_endpoint: "https://mcp.penpot.app/mcp",
    homepage_url: "https://penpot.app/",
    cost_baseline: 0.4,
  },
  {
    agent_id: "framer-site",
    display_name: "framer-site",
    sponsor: "Framer",
    one_liner: "Design-to-website builder with CMS and animation, no code.",
    capabilities: ["design-to-site", "cms", "animation", "no-code-publish"],
    domain_tags: ["design", "website builder", "no-code", "animation", "landing page"],
    mcp_endpoint: "https://mcp.framer.com/mcp",
    homepage_url: "https://framer.com/",
    cost_baseline: 0.45,
  },
  // ── observability near-duplicates (compete with sentry) ──
  {
    agent_id: "datadog-monitoring",
    display_name: "datadog-monitoring",
    sponsor: "Datadog",
    one_liner: "Infrastructure metrics, APM, and dashboards across your fleet.",
    capabilities: ["infra-metrics", "apm", "dashboards", "log-management"],
    domain_tags: ["monitoring", "infrastructure", "metrics", "dashboards", "apm", "hosts"],
    mcp_endpoint: "https://mcp.datadoghq.com/mcp",
    homepage_url: "https://datadoghq.com/",
    cost_baseline: 0.6,
  },
  {
    agent_id: "honeycomb-observability",
    display_name: "honeycomb-observability",
    sponsor: "Honeycomb",
    one_liner: "High-cardinality distributed tracing to debug tail latency + SLOs.",
    capabilities: ["distributed-tracing", "high-cardinality-query", "slo-tracking"],
    domain_tags: ["observability", "tracing", "debugging", "slo", "latency"],
    mcp_endpoint: "https://mcp.honeycomb.io/mcp",
    homepage_url: "https://honeycomb.io/",
    cost_baseline: 0.55,
  },
  // ── project-management near-duplicates (compete with linear / atlassian) ──
  {
    agent_id: "asana-pm",
    display_name: "asana-pm",
    sponsor: "Asana",
    one_liner: "Task and project management with timelines and workflow rules.",
    capabilities: ["tasks", "projects", "timeline", "workflow-automation"],
    domain_tags: ["project management", "tasks", "workflows", "timeline", "marketing ops"],
    mcp_endpoint: "https://mcp.asana.com/mcp",
    homepage_url: "https://asana.com/",
    cost_baseline: 0.4,
  },
  // ── docs near-duplicate (compete with notion) ──
  {
    agent_id: "coda-docs",
    display_name: "coda-docs",
    sponsor: "Coda",
    one_liner: "All-in-one doc with relational tables, formulas, and automations.",
    capabilities: ["docs", "relational-tables", "automations", "packs"],
    domain_tags: ["docs", "database", "automations", "all-in-one", "wiki", "formulas"],
    mcp_endpoint: "https://mcp.coda.io/mcp",
    homepage_url: "https://coda.io/",
    cost_baseline: 0.4,
  },
];
