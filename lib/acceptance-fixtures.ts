// Canonical acceptance fixtures: one in-domain task per sponsor agent and one
// out-of-domain task per agent. The harness uses these to verify each runner
// bids+executes correctly on its specialty AND declines correctly when the
// task is outside its specialty. Adding a new sponsor agent → add a fixture
// here and the readiness dashboard will pick it up automatically.

import type { AgentId, SpecialistExecuteOpts } from "./types";

export interface AcceptanceTaskFixture {
  prompt: string;
  taskType: string;
  /** Optional opts passed to runner.execute when the task is run live. */
  opts?: SpecialistExecuteOpts;
}

export interface AcceptanceFixture {
  agent_id: AgentId;
  /** One canonical task the agent is supposed to handle. */
  in_domain: AcceptanceTaskFixture;
  /** One task that is outside the agent's specialty; the agent must decline. */
  out_of_domain: AcceptanceTaskFixture;
  /**
   * Env vars whose absence means the agent will decline this fixture for
   * credential reasons rather than a real failure. Used by the harness to
   * bucket "blocked_credential" cleanly.
   */
  required_env?: string[];
  /**
   * Endpoint-gated agents (A2A) decline until both an endpoint and credentials
   * exist. The harness treats those declines as "blocked_endpoint" instead of
   * "rejecting_in_domain".
   */
  endpoint_gated?: boolean;
  /**
   * Free-form note about what the canonical task is actually exercising —
   * surfaced in the admin readiness dashboard so reviewers know what passed.
   */
  notes?: string;
}

const FIXTURES: AcceptanceFixture[] = [
  {
    agent_id: "reacher-social",
    in_domain: {
      prompt:
        "We are launching a clean-label electrolyte drink on TikTok Shop next week. Build a ranked creator shortlist, outreach drafts, sample-request notes, launch risk flags, and a first 7-day action plan.",
      taskType: "creator-campaign",
    },
    out_of_domain: {
      prompt:
        "Add Stripe Connect onboarding to our Next.js app so contractors can receive payouts through our marketplace.",
      taskType: "implementation",
    },
    required_env: ["REACHER_API_KEY"],
    notes:
      "Validates: live TikTok Shop MCP tools fire and produce a CampaignLaunchArtifact with creators, outreach, samples, risks, 7-day plan.",
  },
  {
    agent_id: "nia-context",
    in_domain: {
      prompt:
        "Index github.com/anthropics/anthropic-sdk-python and summarize the README — what does the package do, how do I install it, and which client methods should I start with?",
      taskType: "context",
    },
    out_of_domain: {
      prompt:
        "Issue a refund for Stripe charge ch_TEST_42 and email the customer a confirmation receipt.",
      taskType: "operations",
    },
    required_env: ["NIA_API_KEY"],
    notes:
      "Validates: Nia MCP indexing + README synthesis returns repo-grounded context, not invented.",
  },
  {
    agent_id: "hyperspell-brain",
    in_domain: {
      prompt:
        "Pull our latest customer-positioning notes, target audience definition, and revenue assumptions out of workspace memory and return a context brief the executor can reuse.",
      taskType: "context",
    },
    out_of_domain: {
      prompt:
        "Add a new Convex mutation that records pricing-variant assignments and update the dashboard to show conversion-rate by variant.",
      taskType: "implementation",
    },
    required_env: ["HYPERSPELL_API_KEY"],
    notes:
      "Validates: memory-backed business/workspace context retrieval + executor handoff section is present.",
  },
  {
    agent_id: "tensorlake-exec",
    in_domain: {
      prompt:
        "Run a document extraction pipeline over the attached PDF batch and return structured fields for downstream agents.",
      taskType: "document-extraction",
    },
    out_of_domain: {
      prompt:
        "Build a ranked TikTok creator shortlist for an electrolyte drink launch.",
      taskType: "creator-campaign",
    },
    endpoint_gated: true,
    notes:
      "Validates: declines cleanly when no real A2A endpoint configured; produces a real A2A artifact when one is.",
  },
  {
    agent_id: "codex-writer",
    in_domain: {
      prompt:
        "Add a /healthz endpoint to the Next.js app that returns 200 with `{ status: \"ok\", uptime_ms }` and update the README with a curl example.",
      taskType: "implementation",
    },
    out_of_domain: {
      prompt:
        "Pick the three TikTok creators with the best GMV traction for our electrolyte drink launch.",
      taskType: "creator-campaign",
    },
    required_env: ["GITHUB_TOKEN", "OPENAI_API_KEY", "CODEX_DEFAULT_TARGET_REPO"],
    notes:
      "Validates: opens a real PR on the scratch repo (owner/name from CODEX_DEFAULT_TARGET_REPO) and returns a PR URL + files-changed manifest.",
  },
  {
    agent_id: "devin-engineer",
    in_domain: {
      prompt:
        "Refactor the auth middleware in our Next.js app to share a single session helper between the API routes and server components.",
      taskType: "implementation",
    },
    out_of_domain: {
      prompt:
        "Write outreach drafts to three TikTok creators for an electrolyte drink launch.",
      taskType: "creator-campaign",
    },
    endpoint_gated: true,
    required_env: ["DEVIN_API_KEY"],
    notes:
      "Validates: declines without endpoint; runs a real Devin task and returns an A2A artifact when configured.",
  },
  {
    agent_id: "vercel-v0",
    in_domain: {
      prompt:
        "Design a dark-themed pricing page in React/Tailwind with three tiers (Free, Pro, Team), monthly/annual toggle, and a primary CTA per tier.",
      taskType: "frontend",
    },
    out_of_domain: {
      prompt:
        "Write a Convex mutation that records pricing-variant assignments and a query that returns conversion-rate by variant.",
      taskType: "implementation",
    },
    required_env: ["V0_API_KEY"],
    notes:
      "Validates: real v0 API call returns a v0 URL or React/Tailwind code preview.",
  },
  {
    agent_id: "insforge-backend",
    in_domain: {
      prompt:
        "Stand up a REST endpoint that accepts a new pricing-variant assignment and persists it to our Postgres-backed Insforge project.",
      taskType: "implementation",
    },
    out_of_domain: {
      prompt:
        "Generate React/Tailwind hero section copy for a clean-label electrolyte drink landing page.",
      taskType: "frontend",
    },
    endpoint_gated: true,
    notes:
      "Validates: declines without endpoint; produces a real backend artifact when an Insforge A2A endpoint is configured.",
  },
  {
    agent_id: "aside-browser",
    in_domain: {
      prompt:
        "Scrape the pricing pages of three named competitors and return a normalized comparison table (price, included features, currency).",
      taskType: "browser-automation",
    },
    out_of_domain: {
      prompt:
        "Draft outreach DMs to three TikTok creators for an electrolyte drink launch.",
      taskType: "creator-campaign",
    },
    endpoint_gated: true,
    notes:
      "Validates: declines without endpoint; produces a real Aside browser-automation artifact when configured.",
  },
  {
    agent_id: "convex-realtime",
    in_domain: {
      prompt:
        "Add a Convex mutation + subscription that streams real-time auction-bid updates to all subscribed clients, including reconnect handling.",
      taskType: "implementation",
    },
    out_of_domain: {
      prompt:
        "Pick three TikTok creators with the best GMV traction for an electrolyte drink launch.",
      taskType: "creator-campaign",
    },
    endpoint_gated: true,
    notes:
      "Validates: declines without endpoint; produces a real Convex live-state artifact when configured.",
  },
];

export const ACCEPTANCE_FIXTURES: ReadonlyArray<AcceptanceFixture> =
  Object.freeze(FIXTURES);

export function fixtureFor(agent_id: AgentId): AcceptanceFixture | undefined {
  return ACCEPTANCE_FIXTURES.find((f) => f.agent_id === agent_id);
}

/**
 * Returns the env var names that are missing for the given fixture's
 * required_env list. Empty array means the fixture is fully configured.
 */
export function missingEnv(fixture: AcceptanceFixture): string[] {
  if (!fixture.required_env?.length) return [];
  return fixture.required_env.filter((name) => !process.env[name]?.trim());
}
