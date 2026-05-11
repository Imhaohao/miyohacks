import type {
  AgentContact,
  AgentHealthStatus,
  AgentIndustry,
  AgentProtocol,
  BrokeredAgentContact,
} from "./types";

const INDUSTRY_KEYWORDS: Record<AgentIndustry, string[]> = {
  software: [
    "code",
    "repo",
    "github",
    "convex",
    "stripe checkout",
    "typescript",
    "react",
    "bug",
    "deploy",
    "api",
  ],
  finance: [
    "payment",
    "stripe",
    "billing",
    "invoice",
    "expense",
    "finance",
    "runway",
    "tax",
    "payout",
  ],
  legal: [
    "contract",
    "legal",
    "compliance",
    "policy",
    "privacy",
    "soc 2",
    "gdpr",
    "terms",
    "audit",
  ],
  healthcare: [
    "health",
    "patient",
    "clinical",
    "fhir",
    "ehr",
    "hipaa",
    "medical",
    "provider",
    "pharmacy",
  ],
  ecommerce: [
    "shopify",
    "ecommerce",
    "store",
    "checkout",
    "orders",
    "tiktok shop",
    "creator",
    "inventory",
    "fulfillment",
  ],
  marketing: [
    "marketing",
    "campaign",
    "seo",
    "ads",
    "email",
    "lifecycle",
    "conversion",
    "segment",
    "growth",
  ],
  sales: [
    "sales",
    "crm",
    "pipeline",
    "prospect",
    "lead",
    "outbound",
    "demo",
    "account",
    "deal",
  ],
  operations: [
    "ops",
    "operations",
    "project",
    "ticket",
    "workflow",
    "jira",
    "notion",
    "linear",
    "sprint",
  ],
  data: [
    "data",
    "analytics",
    "dashboard",
    "sql",
    "warehouse",
    "funnel",
    "cohort",
    "tracking",
    "metric",
  ],
  "creative-media": [
    "design",
    "figma",
    "creative",
    "video",
    "copy",
    "brand",
    "visual",
    "landing page",
    "screenshot",
  ],
};

const PROTOCOL_BOOST: Record<AgentProtocol, number> = {
  mcp: 0.5,
  a2a: 0.45,
  mock: 0.2,
  manual: 0.05,
};

const HEALTH_BOOST: Record<AgentHealthStatus, number> = {
  healthy: 0.5,
  degraded: 0.15,
  unknown: 0,
  auth_required: -0.1,
  unreachable: -5,
};

export interface RankContactsInput {
  prompt: string;
  taskType: string;
  contextText?: string;
  contacts: AgentContact[];
  reputations?: Record<string, number>;
  limit?: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.+#-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function includesPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(phrase.toLowerCase());
}

function overlapScore(tokens: Set<string>, values: string[]): number {
  let score = 0;
  for (const value of values) {
    const lower = value.toLowerCase();
    if (tokens.has(lower)) score += 1;
    if (lower.includes("-")) {
      for (const part of lower.split("-")) {
        if (tokens.has(part)) score += 0.25;
      }
    }
  }
  return score;
}

export function rankAgentContacts(input: RankContactsInput): BrokeredAgentContact[] {
  const combinedText = [input.prompt, input.taskType, input.contextText]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const tokens = new Set(tokenize(combinedText));
  const limit = input.limit ?? 12;

  return input.contacts
    .filter((contact) => contact.health_status !== "unreachable")
    .map((contact) => {
      const reasons: string[] = [];
      let score = 0;

      const industryHits = INDUSTRY_KEYWORDS[contact.industry].filter((keyword) =>
        includesPhrase(combinedText, keyword),
      );
      if (industryHits.length > 0) {
        score += industryHits.length * 1.5;
        reasons.push(`${contact.industry} match: ${industryHits.slice(0, 3).join(", ")}`);
      }

      const capabilityScore = overlapScore(tokens, contact.capabilities);
      if (capabilityScore > 0) {
        score += capabilityScore * 1.25;
        reasons.push("capability overlap");
      }

      const tagHits = contact.domain_tags.filter((tag) => includesPhrase(combinedText, tag));
      if (tagHits.length > 0) {
        score += Math.min(5, tagHits.length) * 0.9;
        reasons.push(`tag match: ${tagHits.slice(0, 3).join(", ")}`);
      }

      const reputation = input.reputations?.[contact.agent_id] ?? contact.starting_reputation;
      score += reputation;
      score += PROTOCOL_BOOST[contact.protocol];
      score += HEALTH_BOOST[contact.health_status];
      if (contact.verification_status === "verified") score += 0.35;
      if (contact.verification_status === "configured") score += 0.15;
      if (contact.auth_type === "none") score += 0.1;
      if (contact.auth_type === "api_key" && contact.health_status === "auth_required") {
        reasons.push(`needs ${contact.auth_env ?? "API key"} for live tools`);
      }

      if (reasons.length === 0) {
        reasons.push("low-confidence broad-market fallback");
      }

      return {
        contact,
        rank: 0,
        score: Number(score.toFixed(4)),
        reputation_score: reputation,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score || a.contact.agent_id.localeCompare(b.contact.agent_id))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

