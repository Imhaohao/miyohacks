import type {
  AgentContact,
  AgentHealthStatus,
  AgentIndustry,
  AgentProtocol,
  AgentRole,
  AgentVerificationStatus,
  SpecialistConfig,
} from "./types";
import { classifyAgentExecution } from "./agent-execution-status";

interface ContactBlueprint {
  id: string;
  name: string;
  sponsor: string;
  agent_role?: AgentRole;
  one_liner: string;
  capabilities: string[];
  domain_tags: string[];
  protocol?: AgentProtocol;
  endpoint_url?: string;
  agent_card_url?: string;
  auth_env?: string;
  auth_type?: AgentContact["auth_type"];
  verification_status?: AgentVerificationStatus;
  health_status?: AgentHealthStatus;
  artifact_types?: string[];
  cost_baseline?: number;
  starting_reputation?: number;
  homepage_url?: string;
}

interface IndustryCluster {
  industry: AgentIndustry;
  contacts: ContactBlueprint[];
}

const DEFAULT_INPUT_MODES = ["text/plain", "application/json"];
const ARBOR_A2A_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

function arborA2AEndpoint(agentId: string) {
  return `${ARBOR_A2A_ORIGIN}/api/a2a/agents/${agentId}`;
}

const CLUSTERS: IndustryCluster[] = [
  {
    industry: "software",
    contacts: [
      {
        id: "github-engineering",
        name: "GitHub Engineering",
        sponsor: "GitHub",
        one_liner: "Repos, issues, PRs, reviews, and Actions workflows.",
        capabilities: ["repo-search", "open-pull-request", "review-pr", "actions-trigger"],
        domain_tags: ["github", "repo", "pull request", "code", "ci", "issue"],
        protocol: "mcp",
        endpoint_url: "https://api.githubcopilot.com/mcp/",
        auth_env: "GITHUB_TOKEN",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://github.com/",
      },
      {
        id: "vercel-deploy",
        name: "Vercel Deploy",
        sponsor: "Vercel",
        one_liner: "Deployments, env vars, domains, logs, and frontend hosting.",
        capabilities: ["deployment-status", "env-var-management", "domain-config", "log-search"],
        domain_tags: ["vercel", "deploy", "frontend", "hosting", "domain", "logs"],
        protocol: "mcp",
        endpoint_url: "https://mcp.vercel.com",
        auth_env: "VERCEL_TOKEN",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://vercel.com/",
      },
      {
        id: "convex-realtime",
        name: "Convex Realtime",
        sponsor: "Convex",
        one_liner: "Reactive state, mutations, scheduling, and live app data.",
        capabilities: ["convex-schema", "realtime-state", "scheduled-actions", "data-modeling"],
        domain_tags: ["convex", "realtime", "database", "mutations", "backend"],
      },
      {
        id: "nia-context",
        name: "Nia Context",
        sponsor: "Nia",
        agent_role: "context",
        one_liner: "Codebase, docs, package, and source-context retrieval.",
        capabilities: ["repo-context", "code-search", "doc-retrieval", "dependency-context"],
        domain_tags: ["nia", "code context", "repo", "docs", "source", "implementation"],
      },
      {
        id: "codex-writer",
        name: "Codex Writer",
        sponsor: "OpenAI Codex",
        one_liner: "Terse, idiomatic code generation from product specs.",
        capabilities: ["code-generation", "typescript", "react", "api-design"],
        domain_tags: ["code", "typescript", "react", "write function", "implementation"],
      },
      {
        id: "devin-engineer",
        name: "Devin Engineer",
        sponsor: "Devin",
        one_liner: "Multi-step engineering, debugging, and file-by-file plans.",
        capabilities: ["debugging", "refactor", "multi-step-engineering", "repo-change-plan"],
        domain_tags: ["debug", "refactor", "engineering", "bug", "multi-step"],
      },
      {
        id: "supabase-backend",
        name: "Supabase Backend",
        sponsor: "Supabase",
        one_liner: "Postgres, auth, storage, and edge functions.",
        capabilities: ["postgres-query", "auth-user-management", "storage", "edge-functions"],
        domain_tags: ["supabase", "postgres", "auth", "storage", "backend"],
        protocol: "mcp",
        endpoint_url: "https://mcp.supabase.com/mcp",
        auth_env: "SUPABASE_SERVICE_ROLE_KEY",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://supabase.com/",
      },
      {
        id: "neon-postgres",
        name: "Neon Postgres",
        sponsor: "Neon",
        one_liner: "Serverless Postgres branches, schemas, and SQL analysis.",
        capabilities: ["branch-create", "sql-query", "schema-migrate", "connection-pool"],
        domain_tags: ["neon", "postgres", "sql", "database", "schema"],
        protocol: "mcp",
        endpoint_url: "https://mcp.neon.tech/mcp",
        auth_env: "NEON_API_KEY",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://neon.tech/",
      },
      {
        id: "sentry-observability",
        name: "Sentry Observability",
        sponsor: "Sentry",
        one_liner: "Errors, releases, traces, and production debugging.",
        capabilities: ["issue-search", "trace-analysis", "release-tracking", "alert-config"],
        domain_tags: ["sentry", "errors", "monitoring", "observability", "incident"],
        protocol: "mcp",
        endpoint_url: "https://mcp.sentry.dev/mcp",
        auth_env: "SENTRY_AUTH_TOKEN",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://sentry.io/",
      },
      {
        id: "tensorlake-exec",
        name: "Tensorlake Exec",
        sponsor: "Tensorlake",
        one_liner: "Execution traces, runnable snippets, and verification plans.",
        capabilities: ["code-execution", "test-snippets", "execution-traces", "verification"],
        domain_tags: ["run code", "execute", "test", "verify", "trace"],
      },
    ],
  },
  {
    industry: "finance",
    contacts: [
      {
        id: "stripe-payments",
        name: "Stripe Payments",
        sponsor: "Stripe",
        one_liner: "Checkout, billing, Connect, invoices, refunds, and webhooks.",
        capabilities: ["checkout", "stripe-connect", "subscriptions", "refunds", "webhooks"],
        domain_tags: ["payments", "stripe", "checkout", "billing", "subscription", "invoice"],
        protocol: "mcp",
        endpoint_url: "https://mcp.stripe.com",
        auth_env: "STRIPE_API_KEY",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://stripe.com/",
      },
      {
        id: "quickbooks-ledger",
        name: "QuickBooks Ledger",
        sponsor: "Intuit",
        one_liner: "Bookkeeping workflows, reconciliation, invoices, and expense coding.",
        capabilities: ["bookkeeping", "invoice-review", "expense-coding", "reconciliation"],
        domain_tags: ["bookkeeping", "accounting", "invoice", "expense", "reconcile"],
        protocol: "a2a",
        agent_card_url: "https://quickbooks.intuit.com/agent-card.json",
        auth_type: "oauth",
        verification_status: "unverified",
      },
      {
        id: "ramp-expense",
        name: "Ramp Expense",
        sponsor: "Ramp",
        one_liner: "Spend controls, card policies, reimbursements, and vendor review.",
        capabilities: ["spend-control", "expense-policy", "vendor-review", "reimbursements"],
        domain_tags: ["expenses", "spend", "vendor", "procurement", "cards"],
      },
      {
        id: "mercury-banking",
        name: "Mercury Banking",
        sponsor: "Mercury",
        one_liner: "Startup banking workflows, treasury notes, and cash movement planning.",
        capabilities: ["treasury-planning", "cash-flow", "banking-ops", "startup-finance"],
        domain_tags: ["banking", "treasury", "cash", "runway", "startup finance"],
      },
      {
        id: "brex-cards",
        name: "Brex Cards",
        sponsor: "Brex",
        one_liner: "Corporate cards, travel policy, spend limits, and approvals.",
        capabilities: ["card-policy", "travel-expense", "spend-limits", "approval-flows"],
        domain_tags: ["corporate card", "travel", "spend", "approval", "finance ops"],
      },
      {
        id: "plaid-data",
        name: "Plaid Data",
        sponsor: "Plaid",
        one_liner: "Bank-linking data, transactions, balances, and financial app context.",
        capabilities: ["bank-linking", "transactions", "balances", "financial-data"],
        domain_tags: ["plaid", "transactions", "bank data", "balance", "fintech"],
      },
      {
        id: "taxjar-compliance",
        name: "TaxJar Compliance",
        sponsor: "TaxJar",
        one_liner: "Sales tax nexus, taxability notes, and compliance workflows.",
        capabilities: ["sales-tax", "nexus-analysis", "taxability", "filing-workflows"],
        domain_tags: ["tax", "sales tax", "nexus", "compliance", "filing"],
      },
      {
        id: "chargebee-revenue",
        name: "Chargebee Revenue",
        sponsor: "Chargebee",
        one_liner: "Subscription revenue, pricing packages, churn, and expansion metrics.",
        capabilities: ["subscription-ops", "pricing-packages", "churn-analysis", "revenue-metrics"],
        domain_tags: ["subscription", "saas pricing", "revenue", "churn", "billing"],
      },
      {
        id: "pilot-cfo",
        name: "Pilot CFO",
        sponsor: "Pilot",
        one_liner: "Startup finance analysis, runway, budget scenarios, and board-ready notes.",
        capabilities: ["runway-analysis", "budget-scenarios", "finance-reporting", "board-memo"],
        domain_tags: ["cfo", "runway", "budget", "forecast", "board"],
      },
      {
        id: "wise-payouts",
        name: "Wise Payouts",
        sponsor: "Wise",
        one_liner: "Cross-border payouts, currency notes, and transfer planning.",
        capabilities: ["cross-border-payouts", "currency-routing", "transfer-planning", "fx-risk"],
        domain_tags: ["payout", "international", "currency", "transfer", "fx"],
      },
    ],
  },
  {
    industry: "legal",
    contacts: [
      {
        id: "clio-legal-ops",
        name: "Clio Legal Ops",
        sponsor: "Clio",
        one_liner: "Matter intake, legal ops workflows, and client documentation.",
        capabilities: ["matter-intake", "legal-workflows", "client-docs", "case-triage"],
        domain_tags: ["legal", "matter", "case", "client intake", "law firm"],
      },
      {
        id: "ironclad-contracts",
        name: "Ironclad Contracts",
        sponsor: "Ironclad",
        one_liner: "Contract lifecycle, clause review, approvals, and redline planning.",
        capabilities: ["contract-review", "clause-analysis", "approval-routing", "redline-plan"],
        domain_tags: ["contract", "legal", "clause", "redline", "agreement"],
      },
      {
        id: "docusign-agreements",
        name: "DocuSign Agreements",
        sponsor: "DocuSign",
        one_liner: "Signature packets, agreement routing, and envelope operations.",
        capabilities: ["signature-flow", "agreement-routing", "envelope-ops", "signer-status"],
        domain_tags: ["signature", "docusign", "agreement", "envelope", "legal ops"],
      },
      {
        id: "vanta-compliance",
        name: "Vanta Compliance",
        sponsor: "Vanta",
        one_liner: "SOC 2, trust evidence, control mapping, and compliance readiness.",
        capabilities: ["soc2-readiness", "control-mapping", "evidence-review", "policy-gap-analysis"],
        domain_tags: ["soc2", "compliance", "security", "audit", "trust"],
      },
      {
        id: "secureframe-audit",
        name: "Secureframe Audit",
        sponsor: "Secureframe",
        one_liner: "Audit readiness, vendor evidence, and framework mapping.",
        capabilities: ["audit-readiness", "vendor-evidence", "framework-mapping", "policy-review"],
        domain_tags: ["audit", "compliance", "vendor", "policy", "security"],
      },
      {
        id: "privacyos-dpa",
        name: "PrivacyOS DPA",
        sponsor: "PrivacyOS",
        one_liner: "Privacy reviews, DPA checklists, subprocessors, and data maps.",
        capabilities: ["privacy-review", "dpa-checklist", "subprocessor-map", "data-processing"],
        domain_tags: ["privacy", "dpa", "gdpr", "subprocessor", "data map"],
      },
      {
        id: "termly-policies",
        name: "Termly Policies",
        sponsor: "Termly",
        one_liner: "Terms, privacy policy drafts, cookie notes, and website compliance.",
        capabilities: ["terms-draft", "privacy-policy", "cookie-notice", "website-compliance"],
        domain_tags: ["terms", "privacy policy", "cookie", "website legal", "policy"],
      },
      {
        id: "patentpal-ip",
        name: "PatentPal IP",
        sponsor: "PatentPal",
        one_liner: "Patent prior-art notes, invention disclosure, and IP workflow planning.",
        capabilities: ["prior-art-notes", "invention-disclosure", "ip-workflow", "patent-summary"],
        domain_tags: ["patent", "ip", "prior art", "invention", "trademark"],
      },
      {
        id: "deel-employment",
        name: "Deel Employment",
        sponsor: "Deel",
        one_liner: "Contractor, payroll, employment, and international hiring constraints.",
        capabilities: ["contractor-review", "employment-workflow", "payroll-ops", "hiring-compliance"],
        domain_tags: ["employment", "contractor", "payroll", "hiring", "international"],
      },
      {
        id: "rippling-hr-legal",
        name: "Rippling HR Legal",
        sponsor: "Rippling",
        one_liner: "HR policy operations, onboarding compliance, and employee workflow notes.",
        capabilities: ["hr-policy", "onboarding-compliance", "employee-workflows", "access-review"],
        domain_tags: ["hr", "employee", "onboarding", "policy", "compliance"],
      },
    ],
  },
  {
    industry: "healthcare",
    contacts: [
      {
        id: "epic-fhir",
        name: "Epic FHIR",
        sponsor: "Epic",
        one_liner: "FHIR workflow planning, patient-data constraints, and EHR integration notes.",
        capabilities: ["fhir-workflows", "ehr-integration", "patient-data-constraints", "clinical-context"],
        domain_tags: ["fhir", "ehr", "patient", "clinical", "healthcare"],
      },
      {
        id: "redox-integration",
        name: "Redox Integration",
        sponsor: "Redox",
        one_liner: "Healthcare integration mapping, HL7/FHIR notes, and data routing.",
        capabilities: ["hl7-mapping", "fhir-routing", "healthcare-integration", "interface-plan"],
        domain_tags: ["redox", "hl7", "fhir", "health integration", "data routing"],
      },
      {
        id: "athenahealth-ops",
        name: "athenahealth Ops",
        sponsor: "athenahealth",
        one_liner: "Practice operations, scheduling, billing workflows, and patient admin.",
        capabilities: ["practice-ops", "appointment-workflows", "medical-billing", "patient-admin"],
        domain_tags: ["practice", "appointment", "medical billing", "patient ops"],
      },
      {
        id: "doximity-clinician",
        name: "Doximity Clinician",
        sponsor: "Doximity",
        one_liner: "Clinician outreach, network context, and provider communication.",
        capabilities: ["clinician-outreach", "provider-network", "referral-notes", "medical-communication"],
        domain_tags: ["clinician", "provider", "referral", "doctor", "outreach"],
      },
      {
        id: "truepill-pharmacy",
        name: "Truepill Pharmacy",
        sponsor: "Truepill",
        one_liner: "Pharmacy ops, prescription workflow notes, and fulfillment risk.",
        capabilities: ["pharmacy-ops", "prescription-workflow", "fulfillment-risk", "medication-notes"],
        domain_tags: ["pharmacy", "prescription", "medication", "fulfillment", "health"],
      },
      {
        id: "validic-wearables",
        name: "Validic Wearables",
        sponsor: "Validic",
        one_liner: "Wearable data, RPM workflows, and patient monitoring context.",
        capabilities: ["wearable-data", "rpm-workflow", "patient-monitoring", "device-integration"],
        domain_tags: ["wearable", "remote monitoring", "device", "patient data"],
      },
      {
        id: "eligible-insurance",
        name: "Eligible Insurance",
        sponsor: "Eligible",
        one_liner: "Eligibility checks, payer workflows, and insurance admin planning.",
        capabilities: ["eligibility-check", "payer-workflow", "insurance-admin", "benefits-verification"],
        domain_tags: ["insurance", "eligibility", "payer", "benefits", "healthcare"],
      },
      {
        id: "spruce-care",
        name: "Spruce Care",
        sponsor: "Spruce Health",
        one_liner: "Patient messaging, care-team inboxes, and telehealth workflows.",
        capabilities: ["patient-messaging", "care-team-inbox", "telehealth-workflows", "triage"],
        domain_tags: ["patient messaging", "telehealth", "care team", "triage"],
      },
      {
        id: "canvas-medical",
        name: "Canvas Medical",
        sponsor: "Canvas",
        one_liner: "Care-model workflows, clinical protocols, and documentation context.",
        capabilities: ["care-model", "clinical-protocols", "documentation-workflow", "patient-charting"],
        domain_tags: ["clinical protocol", "care model", "charting", "documentation"],
      },
      {
        id: "hipaa-risk",
        name: "HIPAA Risk",
        sponsor: "Compliancy Group",
        one_liner: "HIPAA risk notes, PHI boundaries, and compliance review workflows.",
        capabilities: ["hipaa-review", "phi-boundaries", "risk-assessment", "compliance-notes"],
        domain_tags: ["hipaa", "phi", "health compliance", "risk", "privacy"],
      },
    ],
  },
  {
    industry: "ecommerce",
    contacts: [
      {
        id: "shopify-storefront",
        name: "Shopify Storefront",
        sponsor: "Shopify",
        one_liner: "Storefronts, products, checkout workflows, and commerce operations.",
        capabilities: ["product-catalog", "storefront-ops", "checkout-flow", "order-workflows"],
        domain_tags: ["shopify", "storefront", "checkout", "product", "orders"],
      },
      {
        id: "reacher-social",
        name: "Reacher Social",
        sponsor: "Reacher",
        one_liner: "TikTok Shop creators, videos, GMV, and campaign evidence.",
        capabilities: ["creator-search", "tiktok-shop", "gmv-analysis", "outreach-drafts"],
        domain_tags: ["reacher", "tiktok shop", "creator", "gmv", "commerce"],
      },
      {
        id: "klaviyo-retention",
        name: "Klaviyo Retention",
        sponsor: "Klaviyo",
        one_liner: "Lifecycle email/SMS, segments, retention flows, and campaign copy.",
        capabilities: ["email-flows", "sms-campaigns", "segmentation", "retention-analysis"],
        domain_tags: ["klaviyo", "email", "sms", "retention", "lifecycle"],
      },
      {
        id: "gorgias-support",
        name: "Gorgias Support",
        sponsor: "Gorgias",
        one_liner: "Ecommerce support macros, ticket triage, and CX workflows.",
        capabilities: ["support-macros", "ticket-triage", "cx-workflow", "returns-support"],
        domain_tags: ["support", "cx", "tickets", "returns", "ecommerce"],
      },
      {
        id: "aftership-logistics",
        name: "AfterShip Logistics",
        sponsor: "AfterShip",
        one_liner: "Shipment tracking, delivery exceptions, and post-purchase ops.",
        capabilities: ["shipment-tracking", "delivery-exceptions", "post-purchase", "logistics"],
        domain_tags: ["shipping", "tracking", "delivery", "logistics", "post purchase"],
      },
      {
        id: "shipbob-fulfillment",
        name: "ShipBob Fulfillment",
        sponsor: "ShipBob",
        one_liner: "3PL workflows, inventory placement, fulfillment planning, and SLA risk.",
        capabilities: ["3pl-workflow", "inventory-placement", "fulfillment-plan", "sla-risk"],
        domain_tags: ["fulfillment", "3pl", "inventory", "warehouse", "shipping"],
      },
      {
        id: "amazon-marketplace",
        name: "Amazon Marketplace",
        sponsor: "Amazon",
        one_liner: "Marketplace listing, content, ads readiness, and seller workflow notes.",
        capabilities: ["listing-content", "seller-workflow", "marketplace-ads", "catalog-ops"],
        domain_tags: ["amazon", "marketplace", "listing", "seller", "catalog"],
      },
      {
        id: "google-merchant",
        name: "Google Merchant",
        sponsor: "Google Merchant Center",
        one_liner: "Product feeds, merchant policy checks, and shopping campaign readiness.",
        capabilities: ["product-feed", "merchant-policy", "shopping-campaign", "feed-debug"],
        domain_tags: ["merchant center", "product feed", "shopping", "google ads"],
      },
      {
        id: "yotpo-reviews",
        name: "Yotpo Reviews",
        sponsor: "Yotpo",
        one_liner: "Reviews, loyalty, UGC, and ecommerce proof workflows.",
        capabilities: ["review-strategy", "loyalty-workflow", "ugc-plan", "social-proof"],
        domain_tags: ["reviews", "loyalty", "ugc", "social proof", "ecommerce"],
      },
      {
        id: "loop-returns",
        name: "Loop Returns",
        sponsor: "Loop",
        one_liner: "Return flows, exchange policy, and retention-safe post-purchase workflows.",
        capabilities: ["returns-flow", "exchange-policy", "retention-returns", "refund-workflow"],
        domain_tags: ["returns", "exchange", "refund", "post purchase", "policy"],
      },
    ],
  },
  {
    industry: "marketing",
    contacts: [
      {
        id: "hubspot-marketing",
        name: "HubSpot Marketing",
        sponsor: "HubSpot",
        one_liner: "Campaigns, forms, landing pages, lifecycle nurturing, and CRM context.",
        capabilities: ["campaign-ops", "forms", "landing-pages", "lifecycle-nurture"],
        domain_tags: ["hubspot", "marketing", "campaign", "forms", "landing page"],
      },
      {
        id: "mailchimp-campaigns",
        name: "Mailchimp Campaigns",
        sponsor: "Mailchimp",
        one_liner: "Email campaigns, audience segments, testing plans, and newsletter copy.",
        capabilities: ["email-campaign", "audience-segments", "newsletter-copy", "ab-test-plan"],
        domain_tags: ["mailchimp", "email", "newsletter", "audience", "ab test"],
      },
      {
        id: "semrush-seo",
        name: "Semrush SEO",
        sponsor: "Semrush",
        one_liner: "Keyword research, SEO audits, content gaps, and competitive search notes.",
        capabilities: ["keyword-research", "seo-audit", "content-gap", "competitor-search"],
        domain_tags: ["seo", "keyword", "search", "content", "semrush"],
      },
      {
        id: "ahrefs-content",
        name: "Ahrefs Content",
        sponsor: "Ahrefs",
        one_liner: "Backlinks, content opportunities, keyword clusters, and search intent.",
        capabilities: ["backlink-analysis", "content-opportunities", "keyword-clusters", "search-intent"],
        domain_tags: ["ahrefs", "backlink", "seo", "content", "keyword"],
      },
      {
        id: "metadata-ads",
        name: "Metadata Ads",
        sponsor: "Metadata",
        one_liner: "Paid social experiments, audience testing, and campaign launch plans.",
        capabilities: ["paid-social", "audience-testing", "ad-creative-brief", "campaign-plan"],
        domain_tags: ["paid ads", "facebook ads", "linkedin ads", "campaign", "audience"],
      },
      {
        id: "clearbit-enrichment",
        name: "Clearbit Enrichment",
        sponsor: "Clearbit",
        one_liner: "Account enrichment, ICP filters, and go-to-market segmentation.",
        capabilities: ["account-enrichment", "icp-filtering", "gtm-segmentation", "lead-routing"],
        domain_tags: ["clearbit", "enrichment", "icp", "segmentation", "lead"],
      },
      {
        id: "mutiny-personalization",
        name: "Mutiny Personalization",
        sponsor: "Mutiny",
        one_liner: "Website personalization, account segments, and conversion experiments.",
        capabilities: ["personalization", "conversion-experiments", "account-segments", "web-copy"],
        domain_tags: ["personalization", "conversion", "website", "ab test", "segments"],
      },
      {
        id: "customerio-lifecycle",
        name: "Customer.io Lifecycle",
        sponsor: "Customer.io",
        one_liner: "Triggered lifecycle messaging, events, segments, and activation flows.",
        capabilities: ["lifecycle-messaging", "event-triggering", "activation-flow", "segment-plan"],
        domain_tags: ["customer.io", "lifecycle", "activation", "email", "events"],
      },
      {
        id: "sprout-social",
        name: "Sprout Social",
        sponsor: "Sprout Social",
        one_liner: "Social calendar, community response, content planning, and reporting.",
        capabilities: ["social-calendar", "community-response", "content-plan", "social-reporting"],
        domain_tags: ["social media", "calendar", "community", "content", "reporting"],
      },
      {
        id: "hyperspell-brain",
        name: "Hyperspell Brain",
        sponsor: "Hyperspell",
        agent_role: "executive",
        one_liner: "Workspace knowledge synthesis across internal docs, CRM, Slack, and email.",
        capabilities: ["workspace-synthesis", "internal-knowledge", "crm-context", "briefing"],
        domain_tags: ["hyperspell", "workspace", "context", "crm", "internal knowledge"],
      },
    ],
  },
  {
    industry: "sales",
    contacts: [
      {
        id: "salesforce-crm",
        name: "Salesforce CRM",
        sponsor: "Salesforce",
        one_liner: "CRM records, pipeline fields, opportunity hygiene, and sales workflows.",
        capabilities: ["crm-ops", "pipeline-review", "opportunity-hygiene", "sales-workflow"],
        domain_tags: ["salesforce", "crm", "pipeline", "opportunity", "sales"],
      },
      {
        id: "pipedrive-pipeline",
        name: "Pipedrive Pipeline",
        sponsor: "Pipedrive",
        one_liner: "Deal stages, activity planning, pipeline notes, and small-team sales ops.",
        capabilities: ["deal-stages", "activity-planning", "pipeline-notes", "sales-ops"],
        domain_tags: ["pipedrive", "deal", "pipeline", "sales ops", "activity"],
      },
      {
        id: "gong-calls",
        name: "Gong Calls",
        sponsor: "Gong",
        one_liner: "Call analysis, objection patterns, coaching notes, and deal risk.",
        capabilities: ["call-analysis", "objection-patterns", "deal-risk", "sales-coaching"],
        domain_tags: ["gong", "calls", "objection", "deal risk", "sales coaching"],
      },
      {
        id: "outreach-sequences",
        name: "Outreach Sequences",
        sponsor: "Outreach",
        one_liner: "Prospecting sequences, reply handling, and outbound experiment plans.",
        capabilities: ["prospecting-sequence", "outbound-copy", "reply-handling", "experiment-plan"],
        domain_tags: ["outreach", "sequence", "prospecting", "outbound", "sales email"],
      },
      {
        id: "apollo-prospecting",
        name: "Apollo Prospecting",
        sponsor: "Apollo",
        one_liner: "Prospect targeting, persona lists, enrichment, and outbound briefs.",
        capabilities: ["prospect-targeting", "persona-lists", "lead-enrichment", "outbound-brief"],
        domain_tags: ["apollo", "prospect", "lead", "persona", "outbound"],
      },
      {
        id: "clay-workflows",
        name: "Clay Workflows",
        sponsor: "Clay",
        one_liner: "Enrichment tables, outbound personalization, and growth ops workflows.",
        capabilities: ["enrichment-table", "personalization", "growth-ops", "lead-research"],
        domain_tags: ["clay", "enrichment", "lead research", "personalization", "growth"],
      },
      {
        id: "zoominfo-accounts",
        name: "ZoomInfo Accounts",
        sponsor: "ZoomInfo",
        one_liner: "Account intelligence, firmographics, buying committee, and ICP targeting.",
        capabilities: ["account-intelligence", "firmographics", "buying-committee", "icp-targeting"],
        domain_tags: ["zoominfo", "account", "firmographic", "buyer", "icp"],
      },
      {
        id: "lavender-email",
        name: "Lavender Email",
        sponsor: "Lavender",
        one_liner: "Sales email critique, rewrite, personalization, and deliverability notes.",
        capabilities: ["email-critique", "sales-email-rewrite", "personalization", "deliverability"],
        domain_tags: ["sales email", "rewrite", "lavender", "deliverability", "personalization"],
      },
      {
        id: "chilipiper-routing",
        name: "Chili Piper Routing",
        sponsor: "Chili Piper",
        one_liner: "Inbound scheduling, routing rules, demo handoff, and conversion ops.",
        capabilities: ["inbound-routing", "demo-scheduling", "handoff-rules", "conversion-ops"],
        domain_tags: ["routing", "demo", "calendar", "inbound", "sales ops"],
      },
      {
        id: "chorus-qa",
        name: "Chorus QA",
        sponsor: "Chorus",
        one_liner: "Conversation QA, qualification rubrics, and sales process inspection.",
        capabilities: ["conversation-qa", "qualification-rubric", "process-inspection", "rep-coaching"],
        domain_tags: ["chorus", "call qa", "qualification", "sales process", "coaching"],
      },
    ],
  },
  {
    industry: "operations",
    contacts: [
      {
        id: "linear-issues",
        name: "Linear Issues",
        sponsor: "Linear",
        one_liner: "Issues, projects, cycles, triage, and roadmap execution.",
        capabilities: ["create-issue", "triage", "project-status", "cycle-planning"],
        domain_tags: ["linear", "issue", "ticket", "roadmap", "sprint"],
        protocol: "mcp",
        endpoint_url: "https://mcp.linear.app/mcp",
        auth_env: "LINEAR_API_KEY",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://linear.app/",
      },
      {
        id: "notion-workspace",
        name: "Notion Workspace",
        sponsor: "Notion",
        one_liner: "Docs, databases, wikis, project spaces, and operating system notes.",
        capabilities: ["notion-search", "doc-creation", "database-query", "workspace-ops"],
        domain_tags: ["notion", "docs", "wiki", "database", "workspace"],
        protocol: "mcp",
        endpoint_url: "https://mcp.notion.com/mcp",
        auth_env: "NOTION_API_KEY",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://notion.so/",
      },
      {
        id: "atlassian-suite",
        name: "Atlassian Suite",
        sponsor: "Atlassian",
        one_liner: "Jira, Confluence, sprints, issue workflows, and team docs.",
        capabilities: ["jira-issue-ops", "confluence-docs", "sprint-planning", "ticketing"],
        domain_tags: ["jira", "confluence", "atlassian", "ticket", "sprint"],
        protocol: "mcp",
        endpoint_url: "https://mcp.atlassian.com/v1/mcp",
        auth_env: "ATLASSIAN_API_TOKEN",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://www.atlassian.com/",
      },
      {
        id: "asana-projects",
        name: "Asana Projects",
        sponsor: "Asana",
        one_liner: "Project plans, milestones, dependencies, and task orchestration.",
        capabilities: ["project-plan", "milestones", "dependency-map", "task-orchestration"],
        domain_tags: ["asana", "project", "tasks", "milestone", "dependency"],
      },
      {
        id: "monday-ops",
        name: "monday.com Ops",
        sponsor: "monday.com",
        one_liner: "Workflow boards, status automations, and ops tracking.",
        capabilities: ["workflow-board", "status-automation", "ops-tracking", "resource-plan"],
        domain_tags: ["monday", "board", "workflow", "ops", "status"],
      },
      {
        id: "slack-briefing",
        name: "Slack Briefing",
        sponsor: "Slack",
        one_liner: "Channel summaries, decision logs, handoffs, and team context.",
        capabilities: ["channel-summary", "decision-log", "handoff", "team-context"],
        domain_tags: ["slack", "channel", "summary", "handoff", "decision"],
      },
      {
        id: "zapier-automation",
        name: "Zapier Automation",
        sponsor: "Zapier",
        one_liner: "No-code automations, app triggers, and workflow glue.",
        capabilities: ["zap-design", "trigger-map", "workflow-automation", "app-integration"],
        domain_tags: ["zapier", "automation", "trigger", "workflow", "integration"],
      },
      {
        id: "airtable-ops",
        name: "Airtable Ops",
        sponsor: "Airtable",
        one_liner: "Bases, relational records, lightweight ops apps, and reporting views.",
        capabilities: ["base-design", "record-workflow", "view-build", "lightweight-app"],
        domain_tags: ["airtable", "base", "records", "ops app", "view"],
      },
      {
        id: "deel-ops",
        name: "Deel Ops",
        sponsor: "Deel",
        one_liner: "Global contractor operations, onboarding, and payout workflows.",
        capabilities: ["contractor-onboarding", "global-ops", "payout-process", "compliance-workflow"],
        domain_tags: ["deel", "contractor", "onboarding", "global", "payout"],
      },
      {
        id: "retailops-procurement",
        name: "RetailOps Procurement",
        sponsor: "RetailOps",
        one_liner: "Inventory procurement, vendor follow-up, and ops exception management.",
        capabilities: ["procurement-plan", "vendor-followup", "inventory-exception", "ops-review"],
        domain_tags: ["procurement", "vendor", "inventory", "operations", "supply"],
      },
    ],
  },
  {
    industry: "data",
    contacts: [
      {
        id: "snowflake-warehouse",
        name: "Snowflake Warehouse",
        sponsor: "Snowflake",
        one_liner: "Warehouse schemas, SQL analytics, data marts, and governance notes.",
        capabilities: ["warehouse-schema", "sql-analytics", "data-mart", "governance"],
        domain_tags: ["snowflake", "warehouse", "sql", "data mart", "analytics"],
      },
      {
        id: "bigquery-analytics",
        name: "BigQuery Analytics",
        sponsor: "Google BigQuery",
        one_liner: "BigQuery SQL, event analytics, dashboard feeds, and cost-aware queries.",
        capabilities: ["bigquery-sql", "event-analytics", "dashboard-feed", "query-optimization"],
        domain_tags: ["bigquery", "sql", "events", "analytics", "dashboard"],
      },
      {
        id: "dbt-transform",
        name: "dbt Transform",
        sponsor: "dbt Labs",
        one_liner: "Models, tests, metrics layers, lineage, and analytics engineering.",
        capabilities: ["dbt-models", "data-tests", "metrics-layer", "lineage"],
        domain_tags: ["dbt", "analytics engineering", "models", "metrics", "lineage"],
      },
      {
        id: "looker-dashboard",
        name: "Looker Dashboard",
        sponsor: "Looker",
        one_liner: "Dashboards, explores, semantic metrics, and executive reporting.",
        capabilities: ["dashboard-design", "explore-model", "semantic-metrics", "reporting"],
        domain_tags: ["looker", "dashboard", "metrics", "reporting", "bi"],
      },
      {
        id: "mixpanel-product",
        name: "Mixpanel Product",
        sponsor: "Mixpanel",
        one_liner: "Funnels, cohorts, product analytics, and experiment measurement.",
        capabilities: ["funnel-analysis", "cohort-analysis", "product-analytics", "experiment-metrics"],
        domain_tags: ["mixpanel", "funnel", "cohort", "product analytics", "experiment"],
      },
      {
        id: "amplitude-growth",
        name: "Amplitude Growth",
        sponsor: "Amplitude",
        one_liner: "Activation funnels, retention, cohorts, and growth analytics.",
        capabilities: ["activation-analysis", "retention-cohorts", "growth-metrics", "behavioral-analysis"],
        domain_tags: ["amplitude", "activation", "retention", "growth", "analytics"],
      },
      {
        id: "segment-tracking",
        name: "Segment Tracking",
        sponsor: "Segment",
        one_liner: "Tracking plans, event schemas, destinations, and data-quality checks.",
        capabilities: ["tracking-plan", "event-schema", "destination-routing", "data-quality"],
        domain_tags: ["segment", "tracking", "events", "analytics", "data quality"],
      },
      {
        id: "fivetran-pipelines",
        name: "Fivetran Pipelines",
        sponsor: "Fivetran",
        one_liner: "Data connectors, sync health, pipeline plans, and source coverage.",
        capabilities: ["connector-plan", "sync-health", "pipeline-design", "source-coverage"],
        domain_tags: ["fivetran", "pipeline", "connector", "sync", "etl"],
      },
      {
        id: "hex-notebooks",
        name: "Hex Notebooks",
        sponsor: "Hex",
        one_liner: "Analytical notebooks, SQL/Python workflows, and data storytelling.",
        capabilities: ["notebook-analysis", "sql-python", "data-story", "ad-hoc-analysis"],
        domain_tags: ["hex", "notebook", "analysis", "sql", "python"],
      },
      {
        id: "mode-analytics",
        name: "Mode Analytics",
        sponsor: "Mode",
        one_liner: "SQL reports, dashboard narratives, and embedded analytics briefs.",
        capabilities: ["sql-report", "dashboard-narrative", "embedded-analytics", "analytics-brief"],
        domain_tags: ["mode", "sql", "report", "analytics", "dashboard"],
      },
    ],
  },
  {
    industry: "creative-media",
    contacts: [
      {
        id: "figma-design",
        name: "Figma Design",
        sponsor: "Figma",
        one_liner: "Design files, UI critique, component mapping, and product visuals.",
        capabilities: ["ui-critique", "component-map", "design-file-context", "visual-system"],
        domain_tags: ["figma", "design", "ui", "components", "prototype"],
        protocol: "mcp",
        endpoint_url: "https://mcp.figma.com/mcp",
        auth_env: "FIGMA_ACCESS_TOKEN",
        verification_status: "configured",
        health_status: "auth_required",
        homepage_url: "https://figma.com/",
      },
      {
        id: "vercel-v0",
        name: "Vercel v0",
        sponsor: "Vercel v0",
        one_liner: "Frontend UI generation, landing pages, and shadcn-style screens.",
        capabilities: ["ui-generation", "landing-page", "component-scaffold", "frontend-prototype"],
        domain_tags: ["v0", "ui", "frontend", "landing page", "prototype"],
      },
      {
        id: "canva-creative",
        name: "Canva Creative",
        sponsor: "Canva",
        one_liner: "Marketing visuals, simple decks, social assets, and brand layouts.",
        capabilities: ["visual-assets", "deck-layout", "social-creative", "brand-template"],
        domain_tags: ["canva", "creative", "visual", "deck", "social"],
      },
      {
        id: "adobe-express",
        name: "Adobe Express",
        sponsor: "Adobe",
        one_liner: "Quick creative edits, campaign assets, and brand-safe visual variants.",
        capabilities: ["creative-edit", "asset-variant", "brand-visuals", "campaign-asset"],
        domain_tags: ["adobe", "creative", "assets", "brand", "visual"],
      },
      {
        id: "runway-video",
        name: "Runway Video",
        sponsor: "Runway",
        one_liner: "Video concepts, storyboards, generative video plans, and asset briefs.",
        capabilities: ["video-concept", "storyboard", "generative-video", "asset-brief"],
        domain_tags: ["video", "runway", "storyboard", "creative", "campaign"],
      },
      {
        id: "descript-podcast",
        name: "Descript Podcast",
        sponsor: "Descript",
        one_liner: "Podcast/video editing workflows, transcripts, clips, and show notes.",
        capabilities: ["transcript-edit", "clip-plan", "show-notes", "video-edit-workflow"],
        domain_tags: ["podcast", "transcript", "video editing", "clips", "show notes"],
      },
      {
        id: "buffer-social",
        name: "Buffer Social",
        sponsor: "Buffer",
        one_liner: "Social scheduling, post variants, channel plans, and engagement notes.",
        capabilities: ["post-scheduling", "post-variants", "channel-plan", "engagement-notes"],
        domain_tags: ["buffer", "social", "schedule", "posts", "channels"],
      },
      {
        id: "jasper-copy",
        name: "Jasper Copy",
        sponsor: "Jasper",
        one_liner: "Campaign copy, brand voice variants, product messaging, and ads.",
        capabilities: ["campaign-copy", "brand-voice", "product-messaging", "ad-copy"],
        domain_tags: ["copy", "brand voice", "ads", "messaging", "campaign"],
      },
      {
        id: "grammarly-editor",
        name: "Grammarly Editor",
        sponsor: "Grammarly",
        one_liner: "Tone, clarity, grammar, and polished stakeholder-ready writing.",
        capabilities: ["tone-edit", "clarity-edit", "grammar", "stakeholder-writing"],
        domain_tags: ["grammar", "edit", "tone", "writing", "clarity"],
      },
      {
        id: "aside-browser",
        name: "Aside Browser",
        sponsor: "Aside",
        one_liner: "Browser-based research, visual QA, screenshots, and web task inspection.",
        capabilities: ["browser-research", "visual-qa", "screenshots", "web-inspection"],
        domain_tags: ["browser", "research", "visual qa", "screenshot", "web"],
      },
    ],
  },
];

export const AGENT_CONTACT_CATALOG: AgentContact[] = CLUSTERS.flatMap(
  (cluster) =>
    cluster.contacts.map((contact): AgentContact => {
      const hasNativeMcp = contact.protocol === "mcp" && Boolean(contact.endpoint_url);
      const hasNativeA2A =
        contact.protocol === "a2a" &&
        Boolean(contact.endpoint_url) &&
        Boolean(contact.agent_card_url);
      const protocol: AgentProtocol = hasNativeMcp ? "mcp" : "a2a";
      const bridgedA2A = protocol === "a2a" && !hasNativeA2A;
      const internalA2AEndpoint = arborA2AEndpoint(contact.id);
      const endpointUrl = hasNativeMcp
        ? contact.endpoint_url
        : contact.endpoint_url ?? internalA2AEndpoint;
      const agentCardUrl =
        protocol === "a2a"
          ? hasNativeA2A
            ? contact.agent_card_url
            : internalA2AEndpoint
          : undefined;
      const authType =
        bridgedA2A
          ? "none"
          : (contact.auth_type ?? (contact.auth_env ? "api_key" : "none"));
      const verificationStatus =
        hasNativeMcp
          ? (contact.verification_status ?? "configured")
          : hasNativeA2A
            ? (contact.verification_status ?? "configured")
            : "verified";
      const healthStatus =
        hasNativeMcp
          ? (contact.health_status ?? (contact.auth_env ? "auth_required" : "unknown"))
          : hasNativeA2A
            ? (contact.health_status ?? "unknown")
            : "healthy";
      const executionStatus = classifyAgentExecution({
        agent_id: contact.id,
        protocol,
        endpoint_url: endpointUrl,
        agent_card_url: agentCardUrl,
      });
      return {
        agent_id: contact.id,
        display_name: contact.name,
        sponsor: contact.sponsor,
        industry: cluster.industry,
        agent_role: contact.agent_role,
        protocol,
        one_liner: contact.one_liner,
        capabilities: contact.capabilities,
        domain_tags: Array.from(
          new Set([
            cluster.industry,
            ...contact.domain_tags,
            ...contact.capabilities,
            contact.sponsor.toLowerCase(),
          ]),
        ),
        endpoint_url: endpointUrl,
        agent_card_url: agentCardUrl,
        auth_type: authType,
        auth_env: bridgedA2A ? undefined : contact.auth_env,
        execution_status: executionStatus,
        verification_status:
          executionStatus === "mock_unconnected"
            ? "mock"
            : executionStatus === "needs_vendor_a2a_endpoint"
              ? "unverified"
              : verificationStatus,
        health_status:
          executionStatus === "mock_unconnected"
            ? "unknown"
            : executionStatus === "needs_vendor_a2a_endpoint"
              ? "auth_required"
              : healthStatus,
        supported_input_modes: DEFAULT_INPUT_MODES,
        supported_output_modes: ["text/markdown", "application/json"],
        artifact_types: contact.artifact_types ?? [
          "execution_plan",
          "markdown_report",
          "structured_json",
        ],
        cost_baseline: contact.cost_baseline ?? 0.45,
        starting_reputation: contact.starting_reputation ?? 0.55,
        homepage_url: contact.homepage_url,
      };
    }),
);

export function getAgentContact(agentId: string): AgentContact | undefined {
  return AGENT_CONTACT_CATALOG.find((contact) => contact.agent_id === agentId);
}

export function contactToSpecialistConfig(contact: AgentContact): SpecialistConfig {
  return {
    agent_id: contact.agent_id,
    display_name: contact.display_name,
    sponsor: contact.sponsor,
    agent_role: contact.agent_role,
    capabilities: contact.capabilities,
    system_prompt: [
      `You are ${contact.display_name}, a specialist agent in the ${contact.industry} industry.`,
      contact.one_liner,
      `Your capabilities are: ${contact.capabilities.join(", ")}.`,
      "Only bid when the user's actual task fits your industry, capabilities, and tools. Decline unrelated work.",
      "If selected, first produce an execution plan for buyer approval before doing any externally visible work.",
    ].join("\n"),
    cost_baseline: contact.cost_baseline,
    starting_reputation: contact.starting_reputation,
    one_liner: contact.one_liner,
    mcp_endpoint: contact.protocol === "mcp" ? contact.endpoint_url : undefined,
    mcp_api_key_env: contact.auth_env,
    a2a_agent_card_url: contact.agent_card_url,
    a2a_endpoint: contact.protocol === "a2a" ? contact.endpoint_url : undefined,
    protocol: contact.protocol,
    industry: contact.industry,
    auth_type: contact.auth_type,
    health_status: contact.health_status,
    execution_status: contact.execution_status,
    verification_status: contact.verification_status,
    is_verified: contact.verification_status === "verified",
    homepage_url: contact.homepage_url,
    discovered: true,
    discovery_source: "catalog",
    discovered_for: "100-agent contact catalog",
  };
}
