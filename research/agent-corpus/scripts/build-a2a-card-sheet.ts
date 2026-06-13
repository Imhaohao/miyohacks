import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface AgentCard {
  name?: string;
  display_name?: string;
  description?: string;
  url?: string;
  protocolVersion?: string;
  protocol_version?: string;
  version?: string;
  skills?: Array<{ name?: string; id?: string; description?: string }>;
  capabilities?: unknown;
  provider?: { organization?: string; name?: string };
  security?: unknown;
  securitySchemes?: unknown;
  authentication?: unknown;
}

interface A2ACardRow {
  agent_id: string;
  display_name: string;
  provider: string;
  description: string;
  niche_guess: string;
  declared_a2a_endpoint: string;
  agent_card_url: string;
  card_location_type: "live_well_known" | "repo_raw_card";
  protocol_version: string;
  agent_version: string;
  skill_count: number;
  skill_names: string;
  capabilities: string;
  auth_required: "none" | "api_key" | "oauth" | "unknown";
  verification_status: "verified_live_card" | "verified_repo_card";
  verification_evidence: string;
  discovery_source: string;
  discovery_date: string;
  notes: string;
}

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const TODAY = new Date().toISOString().slice(0, 10);

const SEED_CARD_FILES = [
  seed("a2aproject/a2a-samples", "main", "samples/python/agents/a2a_mcp/agent_cards/air_ticketing_agent.json"),
  seed("a2aproject/a2a-samples", "main", "samples/python/agents/a2a_mcp/agent_cards/car_rental_agent.json"),
  seed("a2aproject/a2a-samples", "main", "samples/python/agents/a2a_mcp/agent_cards/hotel_booking_agent.json"),
  seed("a2aproject/a2a-samples", "main", "samples/python/agents/a2a_mcp/agent_cards/orchestrator_agent.json"),
  seed("a2aproject/a2a-samples", "main", "samples/python/agents/a2a_mcp/agent_cards/planner_agent.json"),
  seed("a2aproject/a2a-samples", "main", "samples/python/agents/adk_currency_agent/src/currency_agent/agent_card.json"),
  seed("a2aproject/a2a-samples", "main", "samples/python/agents/adk_skills_agent/src/skills_agent/agent_card.json"),
  seed("Olddun/earn10-clawtasks-deliverables", "main", ".well-known/agent-card.json"),
  seed("Olddun/earn10-clawtasks-deliverables", "main", ".well-known/agent.json"),
  seed("ximen120/anzai-agent", "main", ".well-known/agent-card.json"),
  seed("bystray/gonka-agent-card", "main", "agent.json"),
  seed("sixpercent-agent/sixpercent-agent", "main", "agent-card.json"),
  seed("Whawi/oracle-agent-card", "main", "public/.well-known/agent-card.json"),
  seed("CSOAI-ORG/meok-aaif-agent-card-mcp", "main", ".well-known/agent.json"),
];

const CSV_HEADERS: Array<keyof A2ACardRow> = [
  "agent_id",
  "display_name",
  "provider",
  "description",
  "niche_guess",
  "declared_a2a_endpoint",
  "agent_card_url",
  "card_location_type",
  "protocol_version",
  "agent_version",
  "skill_count",
  "skill_names",
  "capabilities",
  "auth_required",
  "verification_status",
  "verification_evidence",
  "discovery_source",
  "discovery_date",
  "notes",
];

async function main() {
  await mkdir(ROOT, { recursive: true });
  const rows: A2ACardRow[] = [];
  const seenCardIdentity = new Set<string>();
  const seenAgentIds = new Map<string, number>();

  for (const cardFile of SEED_CARD_FILES) {
    let card: AgentCard;
    try {
      card = await fetchJson<AgentCard>(cardFile.rawUrl);
    } catch (err) {
      console.warn(
        `skipping ${cardFile.repo}/${cardFile.path}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }
    if (!isAgentCard(card)) continue;

    const liveCardUrl = await findLiveWellKnownCard(card.url);
    const cardUrl = liveCardUrl ?? cardFile.rawUrl;
    const locationType = liveCardUrl ? "live_well_known" : "repo_raw_card";
    const identity = `${card.name ?? ""}|${card.url ?? ""}|${
      cardFile.repo
    }`.toLowerCase();
    if (seenCardIdentity.has(identity)) continue;
    seenCardIdentity.add(identity);

    rows.push(
      cardToRow(
        card,
        cardFile.repo,
        cardFile.path,
        cardUrl,
        locationType,
        seenAgentIds,
      ),
    );
  }

  rows.sort(
    (a, b) =>
      a.card_location_type.localeCompare(b.card_location_type) ||
      a.display_name.localeCompare(b.display_name),
  );

  await writeFile(
    path.join(ROOT, "a2a-agent-cards.json"),
    `${JSON.stringify(rows, null, 2)}\n`,
  );
  await writeFile(path.join(ROOT, "a2a-agent-cards.csv"), toCsv(rows));
  await writeFile(
    path.join(ROOT, "a2a-agent-cards-audit.md"),
    renderAudit(rows),
  );

  console.log(`wrote ${rows.length} A2A agent-card rows`);
}

async function findLiveWellKnownCard(endpoint: string | undefined) {
  if (!endpoint) return undefined;
  let origin: string;
  try {
    origin = new URL(endpoint).origin;
  } catch {
    return undefined;
  }
  const candidates = [
    `${origin}/.well-known/agent-card.json`,
    `${origin}/.well-known/agent.json`,
  ];
  for (const candidate of candidates) {
    try {
      const card = await fetchJson<AgentCard>(candidate, 8_000);
      if (isAgentCard(card)) return candidate;
    } catch {
      // Continue probing the fallback path.
    }
  }
  return undefined;
}

function seed(repo: string, branch: string, filePath: string) {
  return {
    repo,
    path: filePath,
    rawUrl: `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`,
  };
}

async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "arbor-agent-corpus",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function isAgentCard(card: AgentCard) {
  return Boolean(
    card.name &&
      (card.url ||
        card.skills ||
        card.capabilities ||
        card.protocolVersion ||
        card.protocol_version),
  );
}

function cardToRow(
  card: AgentCard,
  repo: string,
  cardPath: string,
  cardUrl: string,
  locationType: A2ACardRow["card_location_type"],
  seenAgentIds: Map<string, number>,
): A2ACardRow {
  const displayName = card.display_name ?? card.name ?? "Unnamed A2A agent";
  const provider = card.provider?.organization ?? card.provider?.name ?? repoOwner(repo);
  const skills = card.skills ?? [];
  return {
    agent_id: uniqueSlug(slugify(`${displayName}-${provider}`), seenAgentIds),
    display_name: displayName,
    provider,
    description: card.description ?? "",
    niche_guess: guessNiche(`${displayName} ${card.description ?? ""}`),
    declared_a2a_endpoint: card.url ?? "",
    agent_card_url: cardUrl,
    card_location_type: locationType,
    protocol_version: card.protocolVersion ?? card.protocol_version ?? "",
    agent_version: card.version ?? "",
    skill_count: skills.length,
    skill_names: skills
      .map((skill) => skill.name ?? skill.id)
      .filter((skill): skill is string => Boolean(skill))
      .join("; "),
    capabilities: capabilitiesToString(card.capabilities),
    auth_required: inferAuthRequired(card),
    verification_status:
      locationType === "live_well_known"
        ? "verified_live_card"
        : "verified_repo_card",
    verification_evidence:
      locationType === "live_well_known"
        ? `Fetched parseable Agent Card JSON from live well-known URL on ${TODAY}.`
        : `Fetched parseable Agent Card JSON from GitHub raw source on ${TODAY}.`,
    discovery_source: `github:${repo}:${cardPath}`,
    discovery_date: TODAY,
    notes:
      locationType === "live_well_known"
        ? "Live card URL is preferred over repository fixture."
        : "Repository card is parseable, but live well-known discovery was absent, timed out, or not probed successfully.",
  };
}

function capabilitiesToString(capabilities: unknown) {
  if (!capabilities) return "";
  if (Array.isArray(capabilities)) {
    return capabilities
      .map((capability) =>
        typeof capability === "string"
          ? capability
          : JSON.stringify(capability),
      )
      .join("; ");
  }
  if (typeof capabilities === "object") {
    return Object.entries(capabilities as Record<string, unknown>)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
      .join("; ");
  }
  return String(capabilities);
}

function uniqueSlug(base: string, seen: Map<string, number>) {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  if (count === 0) return base;
  return `${base}-${count + 1}`;
}

function inferAuthRequired(card: AgentCard): A2ACardRow["auth_required"] {
  const raw = JSON.stringify(
    card.security ?? card.securitySchemes ?? card.authentication ?? "",
  ).toLowerCase();
  if (!raw || raw === "\"\"" || raw === "\"none\"" || raw.includes("required\":false")) {
    return "none";
  }
  if (raw.includes("oauth")) return "oauth";
  if (
    raw.includes("api") ||
    raw.includes("bearer") ||
    raw.includes("authorization") ||
    raw.includes("token")
  ) {
    return "api_key";
  }
  return "unknown";
}

function guessNiche(text: string) {
  const lower = text.toLowerCase();
  const rules: Array<[string, string[]]> = [
    ["TravelHospitality/itinerary-planning", ["travel", "ticket", "hotel", "rental", "pickup", "carrier"]],
    ["RealEstate/listing-description", ["real estate", "sell your home", "buyer", "seller"]],
    ["PersonalFinance/crypto-consumer", ["crypto", "stock", "market", "inference fuel", "token"]],
    ["PersonalFinance/budgeting", ["currency", "conversion", "revenue", "earning"]],
    ["ProductivityPersonal/life-admin", ["orchestrates", "planner", "task", "assistant"]],
    ["EducationLearning/career-coaching", ["software development", "knowledge management"]],
  ];
  return (
    rules.find(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))?.[0] ??
    "unknown"
  );
}

function toCsv(rows: A2ACardRow[]) {
  return `${CSV_HEADERS.join(",")}\n${rows
    .map((row) =>
      CSV_HEADERS.map((header) => csvEscape(String(row[header] ?? ""))).join(","),
    )
    .join("\n")}\n`;
}

function renderAudit(rows: A2ACardRow[]) {
  const live = rows.filter((row) => row.card_location_type === "live_well_known");
  const repo = rows.filter((row) => row.card_location_type === "repo_raw_card");
  return `# A2A Agent Cards Audit

Generated: ${TODAY}

| Metric | Count |
|---|---:|
| Total parseable agent cards | ${rows.length} |
| Live well-known cards | ${live.length} |
| Repository-hosted cards | ${repo.length} |

## Notes

- This sheet is intentionally separate from \`agents-corpus.csv\`, which is MCP-only.
- Rows marked \`verified_live_card\` had a parseable card fetched from a live \`/.well-known/agent-card.json\` or \`/.well-known/agent.json\` URL.
- Rows marked \`verified_repo_card\` had a parseable card in a public repository, but live well-known discovery was absent, timed out, or not successful from this environment.
- A2A Hub was identified as a promising directory, but \`https://a2a.build\` returned Cloudflare 521 during this run, so those listed agents were not added without card JSON evidence.
`;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function repoOwner(repo: string) {
  return repo.split("/")[0] ?? repo;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
