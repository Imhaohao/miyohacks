import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type InvocationType =
  | "mcp"
  | "a2a"
  | "rest_api"
  | "embed_api"
  | "gpt_action"
  | "copilot_plugin";
type PricingModel = "free" | "freemium" | "paid" | "unknown";
type AuthRequired = "none" | "api_key" | "oauth" | "user_login" | "unknown";
type VerificationStatus = "verified" | "partial" | "failed" | "unverified";

interface TaxonomyNiche {
  super_category: string;
  niche_id: string;
  niche_label: string;
  consumer_use_cases: string[];
  keywords: string[];
}

interface AgentCorpusRow {
  agent_id: string;
  display_name: string;
  company: string;
  niche_id: string;
  niche_label: string;
  consumer_use_cases: string[];
  invocation_type: InvocationType;
  endpoint_or_docs_url: string;
  homepage_url: string;
  pricing_model: PricingModel;
  auth_required: AuthRequired;
  verification_status: VerificationStatus;
  verification_evidence: string;
  discovery_source: string;
  discovery_date: string;
  quality_score: number;
  notes: string;
}

interface SourceLogEntry {
  source: string;
  fetched_at: string;
  raw_count: number;
  http_invokable_count: number;
  consumer_candidate_count: number;
  kept_count: number;
  overflow_count: number;
  failed_count: number;
  notes: string;
}

interface RegistryRemote {
  type?: string;
  url?: string;
  headers?: unknown;
  variables?: Record<string, unknown>;
}

interface RegistryServer {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  homepage?: string;
  repository?: { url?: string };
  remotes?: RegistryRemote[];
  transports?: RegistryRemote[];
}

interface RegistryEnvelope {
  server?: RegistryServer;
  _meta?: Record<string, unknown>;
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  homepage?: string;
  repository?: { url?: string };
  remotes?: RegistryRemote[];
  transports?: RegistryRemote[];
}

interface RegistryListResponse {
  servers?: RegistryEnvelope[];
  metadata?: { nextCursor?: string; count?: number };
}

interface Candidate {
  row: AgentCorpusRow;
  dedupeKey: string;
}

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const TODAY = new Date().toISOString().slice(0, 10);
const MCP_REGISTRY_BASE =
  process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io";
const MAX_MCP_REGISTRY_PAGES = Number(process.env.MAX_MCP_REGISTRY_PAGES ?? 150);
const PER_NICHE_CAP = 10;
const FINAL_TARGET = 1000;

const TAXONOMY: TaxonomyNiche[] = buildTaxonomy();

const REQUIRED_FIELDS: Array<keyof AgentCorpusRow> = [
  "agent_id",
  "display_name",
  "company",
  "niche_id",
  "niche_label",
  "consumer_use_cases",
  "invocation_type",
  "endpoint_or_docs_url",
  "homepage_url",
  "pricing_model",
  "auth_required",
  "verification_status",
  "verification_evidence",
  "discovery_source",
  "discovery_date",
  "quality_score",
  "notes",
];

const STRONG_CONSUMER_WORDS = [
  "consumer",
  "personal",
  "family",
  "household",
  "kids",
  "student",
  "shopper",
  "travel",
  "trip",
  "home",
  "recipe",
  "fitness",
  "health",
  "wellness",
  "finance",
  "budget",
  "tax",
  "tenant",
  "legal",
  "pet",
  "garden",
  "restaurant",
  "movie",
  "music",
  "book",
  "gaming",
  "sports",
  "dating",
  "event",
  "photo",
  "creative",
  "education",
  "language",
  "homework",
  "coffee",
  "food",
  "shopping",
  "gift",
];

const ENTERPRISE_ONLY_WORDS = [
  "kubernetes",
  "observability",
  "database",
  "data warehouse",
  "ci/cd",
  "devops",
  "incident",
  "crm",
  "erp",
  "salesforce",
  "linear",
  "jira",
  "github",
  "postgres",
  "redis",
  "supabase",
  "vector db",
  "feature flag",
  "campaign performance",
  "meta ads",
  "google ads",
  "b2b",
  "enterprise",
  "sales team",
  "internal ops",
  "cloud infrastructure",
];

async function main() {
  const mode = process.argv[2] ?? "build";
  if (mode === "validate") {
    const rows = JSON.parse(
      await readFile(path.join(ROOT, "agents-corpus.json"), "utf8"),
    ) as AgentCorpusRow[];
    validateRows(rows);
    console.log(`ok - validated ${rows.length} corpus rows`);
    return;
  }

  if (mode !== "build") {
    throw new Error(`unknown mode "${mode}"; use build or validate`);
  }

  await mkdir(ROOT, { recursive: true });

  const harvested = await harvestMcpRegistry();
  const ranked = harvested.candidates.sort(compareCandidates);
  const { kept, overflow } = enforceNicheCaps(ranked);
  validateRows(kept.map((candidate) => candidate.row));

  const sourceLog: SourceLogEntry[] = [
    {
      source: "mcp-registry",
      fetched_at: `${TODAY}T00:00:00.000Z`,
      raw_count: harvested.rawCount,
      http_invokable_count: harvested.httpInvokableCount,
      consumer_candidate_count: harvested.candidates.length,
      kept_count: kept.length,
      overflow_count: overflow.length,
      failed_count: harvested.failedCount,
      notes:
        "Live registry entries are treated as partial verification unless a source-specific probe upgrades the row.",
    },
  ];

  await writeJson("taxonomy.json", TAXONOMY);
  await writeJson(
    "agents-corpus.json",
    kept.map((candidate) => candidate.row),
  );
  await writeFile(
    path.join(ROOT, "agents-corpus.csv"),
    toCsv(kept.map((candidate) => candidate.row)),
  );
  await writeJson(
    "overflow-agents.json",
    overflow.map((candidate) => ({
      ...candidate.row,
      overflow_reason: `niche cap ${PER_NICHE_CAP} already reached for ${candidate.row.niche_id}`,
    })),
  );
  await writeJson("source-log.json", sourceLog);
  await writeFile(
    path.join(ROOT, "source-audit-log.md"),
    renderSourceAudit(kept, overflow, sourceLog, harvested.failedExamples),
  );
  await writeFile(
    path.join(ROOT, "niche-gap-report.md"),
    renderNicheGapReport(kept),
  );
  await writeFile(
    path.join(ROOT, "invocation-type-breakdown.md"),
    renderInvocationBreakdown(kept),
  );

  console.log(
    `wrote ${kept.length} rows, ${overflow.length} overflow rows from ${harvested.rawCount} raw MCP registry entries`,
  );
}

async function harvestMcpRegistry(): Promise<{
  candidates: Candidate[];
  rawCount: number;
  httpInvokableCount: number;
  failedCount: number;
  failedExamples: string[];
}> {
  let cursor: string | undefined;
  const rawEntries: RegistryEnvelope[] = [];
  const seenPageCursors = new Set<string>();

  for (let page = 0; page < MAX_MCP_REGISTRY_PAGES; page += 1) {
    const url = new URL("/v0/servers", MCP_REGISTRY_BASE);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetchWithTimeout(url.toString(), 15_000);
    if (!res.ok) {
      throw new Error(`MCP registry returned HTTP ${res.status}`);
    }
    const json = (await res.json()) as RegistryListResponse;
    rawEntries.push(...(json.servers ?? []));

    const nextCursor = json.metadata?.nextCursor;
    if (!nextCursor || seenPageCursors.has(nextCursor)) break;
    seenPageCursors.add(nextCursor);
    cursor = nextCursor;
  }

  const candidates: Candidate[] = [];
  const seenDedupeKeys = new Set<string>();
  const seenAgentIds = new Map<string, number>();
  let httpInvokableCount = 0;
  let failedCount = 0;
  const failedExamples: string[] = [];

  for (const entry of rawEntries) {
    const server = normalizeRegistryServer(entry);
    if (!server.name) {
      failedCount += 1;
      continue;
    }

    const remote = pickHttpRemote(server);
    if (!remote?.url) continue;
    httpInvokableCount += 1;

    const endpoint = normalizeUrl(remote.url);
    if (!endpoint) {
      failedCount += 1;
      failedExamples.push(`${server.name}: invalid endpoint ${remote.url}`);
      continue;
    }

    const text = `${server.name} ${server.title ?? ""} ${
      server.description ?? ""
    }`.toLowerCase();
    const niche = classifyNiche(text);
    if (!niche) continue;
    if (!isConsumerCandidate(text, niche)) continue;

    const dedupeKey = endpointDedupeKey(endpoint);
    if (seenDedupeKeys.has(dedupeKey)) continue;
    seenDedupeKeys.add(dedupeKey);

    const displayName = server.title ?? titleFromRegistryName(server.name);
    const company = companyFromRegistryName(server.name, displayName);
    const authRequired = inferAuthRequired(remote);
    const qualityScore = inferQualityScore(entry, authRequired);
    const agentId = uniqueSlug(
      slugify(`${server.name}-${new URL(endpoint).host}`),
      seenAgentIds,
    );

    candidates.push({
      dedupeKey,
      row: {
        agent_id: agentId,
        display_name: displayName,
        company,
        niche_id: niche.niche_id,
        niche_label: niche.niche_label,
        consumer_use_cases: niche.consumer_use_cases,
        invocation_type: "mcp",
        endpoint_or_docs_url: endpoint,
        homepage_url:
          server.websiteUrl ??
          server.homepage ??
          server.repository?.url ??
          endpointOrigin(endpoint),
        pricing_model: "unknown",
        auth_required: authRequired,
        verification_status: "partial",
        verification_evidence: `${remote.type} MCP remote listed in registry.modelcontextprotocol.io on ${TODAY}; live tools/list not attempted by offline corpus builder`,
        discovery_source: "mcp-registry:v0/servers",
        discovery_date: TODAY,
        quality_score: qualityScore,
        notes: `Registry package ${server.name}${
          server.version ? `@${server.version}` : ""
        }; classified by keyword rules.`,
      },
    });
  }

  return {
    candidates,
    rawCount: rawEntries.length,
    httpInvokableCount,
    failedCount,
    failedExamples: failedExamples.slice(0, 20),
  };
}

function normalizeRegistryServer(entry: RegistryEnvelope): RegistryServer {
  const server = entry.server ?? entry;
  return {
    id: server.id ?? entry.id,
    name: server.name ?? entry.name,
    title: server.title ?? entry.title,
    description: server.description ?? entry.description,
    version: server.version ?? entry.version,
    websiteUrl: server.websiteUrl,
    homepage: server.homepage ?? entry.homepage,
    repository: server.repository,
    remotes: server.remotes,
    transports: server.transports,
  };
}

function pickHttpRemote(server: RegistryServer): RegistryRemote | undefined {
  const remotes = [...(server.remotes ?? []), ...(server.transports ?? [])];
  return (
    remotes.find(
      (remote) => remote.type === "streamable-http" && Boolean(remote.url),
    ) ?? remotes.find((remote) => remote.type === "sse" && Boolean(remote.url))
  );
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function classifyNiche(text: string): TaxonomyNiche | undefined {
  let best: { niche: TaxonomyNiche; score: number } | undefined;
  for (const niche of TAXONOMY) {
    let score = 0;
    for (const keyword of niche.keywords) {
      if (text.includes(keyword.toLowerCase())) score += keyword.length;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { niche, score };
    }
  }
  return best?.niche;
}

function isConsumerCandidate(text: string, niche: TaxonomyNiche): boolean {
  const hasStrongConsumerSignal = STRONG_CONSUMER_WORDS.some((word) =>
    text.includes(word),
  );
  const hasNicheSignal = niche.keywords.some((word) =>
    text.includes(word.toLowerCase()),
  );
  const hasEnterpriseOnlySignal = ENTERPRISE_ONLY_WORDS.some((word) =>
    text.includes(word),
  );
  return hasNicheSignal && (hasStrongConsumerSignal || !hasEnterpriseOnlySignal);
}

function enforceNicheCaps(candidates: Candidate[]) {
  const counts = new Map<string, number>();
  const kept: Candidate[] = [];
  const overflow: Candidate[] = [];
  for (const candidate of candidates) {
    const current = counts.get(candidate.row.niche_id) ?? 0;
    if (current < PER_NICHE_CAP) {
      kept.push(candidate);
      counts.set(candidate.row.niche_id, current + 1);
    } else {
      overflow.push(candidate);
    }
  }
  return { kept, overflow };
}

function compareCandidates(a: Candidate, b: Candidate) {
  return (
    b.row.quality_score - a.row.quality_score ||
    a.row.niche_id.localeCompare(b.row.niche_id) ||
    a.row.agent_id.localeCompare(b.row.agent_id)
  );
}

function validateRows(rows: AgentCorpusRow[]) {
  const seenIds = new Set<string>();
  const seenEndpointKeys = new Set<string>();
  const nicheCounts = new Map<string, number>();
  const nicheIds = new Set(TAXONOMY.map((niche) => niche.niche_id));
  const invocationTypes = new Set<InvocationType>([
    "mcp",
    "a2a",
    "rest_api",
    "embed_api",
    "gpt_action",
    "copilot_plugin",
  ]);
  const pricingModels = new Set<PricingModel>([
    "free",
    "freemium",
    "paid",
    "unknown",
  ]);
  const authTypes = new Set<AuthRequired>([
    "none",
    "api_key",
    "oauth",
    "user_login",
    "unknown",
  ]);
  const verificationStatuses = new Set<VerificationStatus>([
    "verified",
    "partial",
    "failed",
    "unverified",
  ]);

  for (const [index, row] of rows.entries()) {
    for (const field of REQUIRED_FIELDS) {
      if (row[field] === undefined || row[field] === null) {
        throw new Error(`row ${index} missing ${field}`);
      }
    }
    if (seenIds.has(row.agent_id)) {
      throw new Error(`duplicate agent_id ${row.agent_id}`);
    }
    seenIds.add(row.agent_id);

    const endpointKey = endpointDedupeKey(row.endpoint_or_docs_url);
    if (seenEndpointKeys.has(endpointKey)) {
      throw new Error(`duplicate endpoint/domain key ${endpointKey}`);
    }
    seenEndpointKeys.add(endpointKey);

    if (!nicheIds.has(row.niche_id)) {
      throw new Error(`unknown niche_id ${row.niche_id}`);
    }
    if (!invocationTypes.has(row.invocation_type)) {
      throw new Error(`bad invocation_type ${row.invocation_type}`);
    }
    if (!pricingModels.has(row.pricing_model)) {
      throw new Error(`bad pricing_model ${row.pricing_model}`);
    }
    if (!authTypes.has(row.auth_required)) {
      throw new Error(`bad auth_required ${row.auth_required}`);
    }
    if (!verificationStatuses.has(row.verification_status)) {
      throw new Error(`bad verification_status ${row.verification_status}`);
    }
    if (!Array.isArray(row.consumer_use_cases) || row.consumer_use_cases.length < 1) {
      throw new Error(`row ${row.agent_id} has no consumer_use_cases`);
    }
    if (row.quality_score < 1 || row.quality_score > 5) {
      throw new Error(`row ${row.agent_id} quality_score outside 1-5`);
    }

    const nextCount = (nicheCounts.get(row.niche_id) ?? 0) + 1;
    if (nextCount > PER_NICHE_CAP) {
      throw new Error(`niche ${row.niche_id} exceeds cap ${PER_NICHE_CAP}`);
    }
    nicheCounts.set(row.niche_id, nextCount);
  }
}

function renderSourceAudit(
  kept: Candidate[],
  overflow: Candidate[],
  sourceLog: SourceLogEntry[],
  failedExamples: string[],
) {
  const representedNiches = new Set(kept.map((candidate) => candidate.row.niche_id));
  const atCap = countBy(kept, (candidate) => candidate.row.niche_id).filter(
    ([, count]) => count >= PER_NICHE_CAP,
  ).length;
  const verifiedOrPartial = kept.filter((candidate) =>
    ["verified", "partial"].includes(candidate.row.verification_status),
  ).length;
  const avgQuality =
    kept.reduce((sum, candidate) => sum + candidate.row.quality_score, 0) /
    Math.max(1, kept.length);

  return `# Source Audit Log

Generated: ${TODAY}

## Target Progress

| Metric | Current | Final target |
|---|---:|---:|
| Verified or partial invokable rows | ${verifiedOrPartial} | ${FINAL_TARGET} |
| Distinct represented niches | ${representedNiches.size} | >= 100 |
| Niches at cap (${PER_NICHE_CAP}) | ${atCap} | 30-50 |
| Average quality_score | ${avgQuality.toFixed(2)} | >= 3.5 |
| Overflow rows | ${overflow.length} | tracked, not capped corpus |

## Sources

| Source | Raw | HTTP invokable | Consumer candidates | Kept | Overflow | Failed |
|---|---:|---:|---:|---:|---:|---:|
${sourceLog
  .map(
    (entry) =>
      `| ${entry.source} | ${entry.raw_count} | ${entry.http_invokable_count} | ${entry.consumer_candidate_count} | ${entry.kept_count} | ${entry.overflow_count} | ${entry.failed_count} |`,
  )
  .join("\n")}

## Notes

- The MCP registry lane is implemented first because it is reproducible and directly invokable.
- Registry rows are marked \`partial\` when a public MCP remote is listed but live \`tools/list\` was not called with credentials.
- The corpus intentionally does not synthesize agents to satisfy the 1,000-row target.
- Follow-up harvesters should add A2A directories, Luma, YC, GPT/Copilot action galleries, Product Hunt, and press/blog backfills.

## Failed Examples

${
  failedExamples.length === 0
    ? "- None captured."
    : failedExamples.map((example) => `- ${example}`).join("\n")
}
`;
}

function renderNicheGapReport(kept: Candidate[]) {
  const counts = new Map(countBy(kept, (candidate) => candidate.row.niche_id));
  const rows = TAXONOMY.map((niche) => ({
    ...niche,
    count: counts.get(niche.niche_id) ?? 0,
  }))
    .filter((niche) => niche.count < 3)
    .sort((a, b) => a.count - b.count || a.niche_id.localeCompare(b.niche_id));

  return `# Niche Gap Report

Generated: ${TODAY}

Niches below 3 corpus rows should be prioritized by source-specific searches.

| Niche | Count | Suggested query |
|---|---:|---|
${rows
  .map(
    (niche) =>
      `| ${niche.niche_id} | ${niche.count} | ${suggestedGapQuery(niche)} |`,
  )
  .join("\n")}
`;
}

function renderInvocationBreakdown(kept: Candidate[]) {
  const byInvocation = countBy(kept, (candidate) => candidate.row.invocation_type);
  const byStatus = countBy(kept, (candidate) => candidate.row.verification_status);
  const byAuth = countBy(kept, (candidate) => candidate.row.auth_required);

  return `# Invocation Type Breakdown

Generated: ${TODAY}

## Invocation Types

| Type | Count |
|---|---:|
${byInvocation.map(([type, count]) => `| ${type} | ${count} |`).join("\n")}

## Verification Status

| Status | Count |
|---|---:|
${byStatus.map(([status, count]) => `| ${status} | ${count} |`).join("\n")}

## Auth Required

| Auth | Count |
|---|---:|
${byAuth.map(([auth, count]) => `| ${auth} | ${count} |`).join("\n")}
`;
}

function toCsv(rows: AgentCorpusRow[]) {
  const headers = REQUIRED_FIELDS;
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          return csvEscape(Array.isArray(value) ? value.join("; ") : String(value));
        })
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function writeJson(fileName: string, value: unknown) {
  await writeFile(
    path.join(ROOT, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function inferAuthRequired(remote: RegistryRemote): AuthRequired {
  const headersText = JSON.stringify(remote.headers ?? "").toLowerCase();
  const variablesText = JSON.stringify(remote.variables ?? "").toLowerCase();
  if (headersText.includes("oauth") || variablesText.includes("oauth")) {
    return "oauth";
  }
  if (
    headersText.includes("authorization") ||
    headersText.includes("api") ||
    variablesText.includes("api") ||
    variablesText.includes("token") ||
    variablesText.includes("key")
  ) {
    return "api_key";
  }
  return "none";
}

function inferQualityScore(entry: RegistryEnvelope, authRequired: AuthRequired) {
  const meta = JSON.stringify(entry._meta ?? {}).toLowerCase();
  const isActive = meta.includes("active") || meta.includes("latest");
  if (isActive && authRequired === "none") return 4;
  if (isActive) return 3;
  return 2;
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return undefined;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function endpointOrigin(url: string) {
  return new URL(url).origin;
}

function endpointDedupeKey(url: string, server?: RegistryServer) {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    const serverName = server?.name?.toLowerCase() ?? "";
    return `${host}${normalizedPath}:${serverName}`;
  } catch {
    return url.toLowerCase();
  }
}

function titleFromRegistryName(name: string) {
  const tail = name.split("/").at(-1) ?? name;
  const cleaned = tail
    .replace(/[-_]+/g, " ")
    .replace(/\bmcp\b/gi, "")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (cleaned) return cleaned;
  return name
    .replace(/[./_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function companyFromRegistryName(name: string, fallback: string) {
  const owner = name.split("/")[0] ?? fallback;
  const parts = owner.split(".");
  return (parts.length > 1 ? parts.at(-2) : owner) ?? fallback;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function uniqueSlug(base: string, seen: Map<string, number>) {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  if (count === 0) return base;
  return `${base}-${count + 1}`;
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function suggestedGapQuery(niche: TaxonomyNiche) {
  const keyword = niche.keywords[0] ?? niche.niche_id;
  return `"MCP server" OR "agent card" OR "AI agent API" ${keyword}`;
}

function buildTaxonomy(): TaxonomyNiche[] {
  const groups: Array<{
    superCategory: string;
    leaves: Array<[string, string, string[], string[]]>;
  }> = [
    {
      superCategory: "HealthWellness",
      leaves: [
        ["symptom-triage", "Symptom triage", ["check symptoms", "prepare doctor questions"], ["symptom", "triage", "diagnosis", "health"]],
        ["mental-health-coach", "Mental health coach", ["reflect on mood", "practice coping skills"], ["mental health", "therapy", "mood", "mindfulness"]],
        ["medication-reminders", "Medication reminders", ["track doses", "avoid missed refills"], ["medication", "pharmacy", "prescription", "pill"]],
        ["fitness-coaching", "Fitness coaching", ["build workouts", "track progress"], ["fitness", "workout", "exercise", "gym"]],
        ["nutrition-meal-plan", "Nutrition meal plan", ["plan meals", "balance macros"], ["nutrition", "meal plan", "diet", "calorie"]],
        ["sleep-coaching", "Sleep coaching", ["improve sleep schedule", "track rest"], ["sleep", "insomnia", "bedtime", "rest"]],
        ["chronic-condition-tracker", "Chronic condition tracker", ["track symptoms", "summarize trends"], ["chronic", "diabetes", "blood pressure", "condition"]],
        ["telehealth-scheduling", "Telehealth scheduling", ["find care", "book virtual visit"], ["telehealth", "doctor", "appointment", "clinic"]],
        ["womens-health", "Women's health", ["track cycle", "prepare care questions"], ["women", "cycle", "fertility", "pregnancy"]],
        ["elder-care-companion", "Elder care companion", ["coordinate care", "check in on parent"], ["elder", "senior", "caregiver", "aging"]],
      ],
    },
    {
      superCategory: "PersonalFinance",
      leaves: [
        ["budgeting", "Budgeting", ["build household budget", "categorize spending"], ["budget", "spending", "personal finance", "money"]],
        ["tax-prep-assistant", "Tax prep assistant", ["prepare tax documents", "explain deductions"], ["tax", "irs", "deduction", "filing"]],
        ["debt-payoff", "Debt payoff", ["compare payoff plans", "track balances"], ["debt", "loan", "payoff", "credit card"]],
        ["investment-education", "Investment education", ["learn investing basics", "compare portfolios"], ["invest", "portfolio", "stock", "trading"]],
        ["credit-score", "Credit score", ["monitor credit", "explain score changes"], ["credit score", "credit report", "fico", "credit"]],
        ["expense-categorization", "Expense categorization", ["label transactions", "find spending patterns"], ["expense", "transaction", "categorize", "receipt"]],
        ["bill-negotiation", "Bill negotiation", ["lower bills", "compare providers"], ["bill", "negotiate", "subscription", "utility"]],
        ["savings-goals", "Savings goals", ["plan emergency fund", "track saving"], ["savings", "goal", "emergency fund", "save"]],
        ["crypto-consumer", "Crypto consumer", ["track wallet", "explain crypto risk"], ["crypto", "wallet", "blockchain", "defi"]],
        ["insurance-shopping", "Insurance shopping", ["compare quotes", "understand coverage"], ["insurance", "quote", "coverage", "policy"]],
      ],
    },
    {
      superCategory: "EducationLearning",
      leaves: [
        ["homework-help", "Homework help", ["explain assignments", "practice problems"], ["homework", "student", "school", "math"]],
        ["language-tutor", "Language tutor", ["practice conversation", "translate phrases"], ["language", "tutor", "translation", "spanish"]],
        ["exam-prep", "Exam prep", ["make study plan", "quiz weak areas"], ["exam", "sat", "test prep", "quiz"]],
        ["career-coaching", "Career coaching", ["plan career move", "rewrite resume"], ["career", "resume", "job search", "interview"]],
        ["coding-for-kids", "Coding for kids", ["teach coding", "build simple games"], ["kids coding", "learn code", "children", "coding"]],
        ["music-lessons", "Music lessons", ["practice instrument", "learn theory"], ["music lesson", "piano", "guitar", "instrument"]],
        ["college-admissions", "College admissions", ["plan applications", "review essays"], ["college", "admissions", "university", "essay"]],
        ["research-assistant-student", "Student research assistant", ["summarize sources", "organize notes"], ["research", "student", "citation", "paper"]],
        ["flashcard-generator", "Flashcard generator", ["make cards", "review spaced repetition"], ["flashcard", "anki", "memorize", "study"]],
        ["special-needs-learning", "Special needs learning", ["adapt lessons", "support accessibility"], ["special needs", "dyslexia", "iep", "accessibility"]],
      ],
    },
    {
      superCategory: "HomeFamily",
      leaves: [
        ["cleaning-schedules", "Cleaning schedules", ["assign chores", "plan cleaning"], ["cleaning", "chores", "housework", "tidy"]],
        ["home-maintenance", "Home maintenance", ["diagnose repairs", "schedule upkeep"], ["home maintenance", "repair", "plumbing", "hvac"]],
        ["parenting-advice", "Parenting advice", ["handle routines", "find age-appropriate advice"], ["parenting", "parent", "child", "toddler"]],
        ["baby-tracking", "Baby tracking", ["track feeding", "monitor sleep"], ["baby", "infant", "feeding", "diaper"]],
        ["recipe-meal-prep", "Recipe meal prep", ["plan dinners", "use pantry ingredients"], ["recipe", "meal prep", "cooking", "pantry"]],
        ["smart-home-control", "Smart home control", ["control devices", "create automations"], ["smart home", "iot", "home assistant", "device"]],
        ["moving-relocation", "Moving relocation", ["plan move", "compare neighborhoods"], ["moving", "relocation", "mover", "address change"]],
        ["interior-design-consumer", "Interior design", ["redesign room", "choose furniture"], ["interior design", "room design", "decor", "furniture"]],
        ["pet-care", "Pet care", ["track pet health", "find pet services"], ["pet", "dog", "cat", "veterinary"]],
        ["gardening", "Gardening", ["identify plants", "plan garden"], ["garden", "plant", "lawn", "horticulture"]],
      ],
    },
    {
      superCategory: "ShoppingRetail",
      leaves: [
        ["product-research", "Product research", ["compare products", "summarize reviews"], ["product", "reviews", "shopping", "compare"]],
        ["price-tracking", "Price tracking", ["watch price drops", "compare deals"], ["price", "deal", "discount", "coupon"]],
        ["wardrobe-stylist", "Wardrobe stylist", ["style outfits", "plan wardrobe"], ["wardrobe", "stylist", "fashion", "outfit"]],
        ["gift-finder", "Gift finder", ["find gifts", "match recipient"], ["gift", "present", "wishlist", "holiday"]],
        ["grocery-list", "Grocery list", ["build grocery list", "optimize store trip"], ["grocery", "shopping list", "supermarket", "cart"]],
        ["secondhand-resale", "Secondhand resale", ["price used items", "write listing"], ["resale", "secondhand", "ebay", "marketplace"]],
        ["beauty-recommendations", "Beauty recommendations", ["choose skincare", "match makeup"], ["beauty", "skincare", "makeup", "cosmetic"]],
        ["furniture-fit", "Furniture fit", ["check dimensions", "place furniture"], ["furniture", "sofa", "chair", "room fit"]],
        ["subscription-management", "Subscription management", ["find unused subscriptions", "cancel services"], ["subscription", "cancel", "membership", "recurring"]],
        ["returns-assistant", "Returns assistant", ["handle returns", "track refunds"], ["return", "refund", "warranty", "order"]],
      ],
    },
    {
      superCategory: "TravelHospitality",
      leaves: [
        ["itinerary-planning", "Travel itinerary planning", ["plan weekend trip", "organize activities"], ["itinerary", "trip", "travel plan", "vacation"]],
        ["flight-deals", "Flight deals", ["find cheap flights", "track fares"], ["flight", "airfare", "airline", "fare"]],
        ["hotel-booking", "Hotel booking", ["compare hotels", "book stay"], ["hotel", "lodging", "booking", "stay"]],
        ["local-experiences", "Local experiences", ["find activities", "discover places"], ["local experience", "tour", "things to do", "attraction"]],
        ["visa-docs", "Visa documents", ["prepare visa docs", "check travel rules"], ["visa", "passport", "immigration", "travel document"]],
        ["road-trip", "Road trip", ["plan route", "find stops"], ["road trip", "route", "drive", "rv"]],
        ["loyalty-points", "Loyalty points", ["optimize points", "compare redemptions"], ["points", "miles", "loyalty", "reward"]],
        ["travel-insurance", "Travel insurance", ["compare policies", "understand coverage"], ["travel insurance", "trip insurance", "coverage", "claim"]],
        ["group-trip-coordination", "Group trip coordination", ["coordinate group plans", "split choices"], ["group trip", "friends trip", "travel coordination", "split"]],
        ["accessibility-travel", "Accessibility travel", ["find accessible options", "plan support"], ["accessible travel", "wheelchair", "accessibility", "mobility"]],
      ],
    },
    {
      superCategory: "FoodDining",
      leaves: [
        ["restaurant-picker", "Restaurant picker", ["choose restaurants", "match preferences"], ["restaurant", "dining", "eat out", "cuisine"]],
        ["reservation-booking", "Reservation booking", ["book table", "track availability"], ["reservation", "table", "opentable", "booking"]],
        ["dietary-restrictions", "Dietary restrictions", ["find safe meals", "filter menus"], ["dietary", "vegan", "gluten", "kosher"]],
        ["wine-pairing", "Wine pairing", ["pair wine", "choose bottle"], ["wine", "pairing", "sommelier", "bottle"]],
        ["meal-delivery-optimize", "Meal delivery optimize", ["choose delivery", "compare fees"], ["meal delivery", "doordash", "ubereats", "delivery"]],
        ["cooking-assistant", "Cooking assistant", ["cook step-by-step", "substitute ingredients"], ["cook", "recipe", "kitchen", "ingredient"]],
        ["food-allergy-scan", "Food allergy scan", ["scan ingredients", "avoid allergens"], ["allergy", "allergen", "ingredient scan", "label"]],
        ["farmers-market", "Farmers market", ["find markets", "plan seasonal shopping"], ["farmers market", "seasonal", "produce", "local food"]],
        ["calorie-tracking", "Calorie tracking", ["log meals", "track nutrition"], ["calorie", "macro", "nutrition", "food log"]],
        ["cocktail-recipes", "Cocktail recipes", ["mix drinks", "use bar ingredients"], ["cocktail", "drink", "bar", "mixology"]],
      ],
    },
    {
      superCategory: "EntertainmentMedia",
      leaves: [
        ["movie-picker", "Movie picker", ["choose a movie", "match group taste"], ["movie", "film", "cinema", "watch"]],
        ["book-recommendations", "Book recommendations", ["find books", "track reading"], ["book", "reading", "novel", "library"]],
        ["podcast-discovery", "Podcast discovery", ["find podcasts", "summarize episodes"], ["podcast", "episode", "audio show", "listen"]],
        ["gaming-companion", "Gaming companion", ["get game help", "track quests"], ["game", "gaming", "xbox", "playstation"]],
        ["fan-community", "Fan community", ["follow fandom", "summarize updates"], ["fan", "fandom", "community", "creator"]],
        ["event-tickets", "Event tickets", ["find tickets", "compare seats"], ["ticket", "concert", "event", "show"]],
        ["streaming-optimize", "Streaming optimize", ["find where to watch", "manage services"], ["streaming", "netflix", "hulu", "watchlist"]],
        ["creative-writing-hobby", "Creative writing hobby", ["write stories", "develop characters"], ["creative writing", "story", "fiction", "writing"]],
        ["photo-editing-consumer", "Photo editing consumer", ["edit photos", "organize images"], ["photo", "image", "editing", "album"]],
        ["music-discovery", "Music discovery", ["find music", "build playlists"], ["music", "playlist", "song", "artist"]],
      ],
    },
    {
      superCategory: "LegalConsumer",
      leaves: [
        ["tenant-rights", "Tenant rights", ["understand lease", "prepare landlord letter"], ["tenant", "rent", "lease", "landlord"]],
        ["small-claims", "Small claims", ["prepare claim", "organize evidence"], ["small claims", "court", "claim", "dispute"]],
        ["contract-simplify", "Contract simplify", ["explain contract", "spot risky clauses"], ["contract", "terms", "agreement", "legal"]],
        ["immigration-consumer", "Immigration consumer", ["prepare forms", "understand process"], ["immigration", "visa", "uscis", "green card"]],
        ["estate-planning-lite", "Estate planning lite", ["draft checklist", "explain will basics"], ["estate", "will", "trust", "beneficiary"]],
        ["consumer-disputes", "Consumer disputes", ["draft complaint", "track dispute"], ["consumer dispute", "chargeback", "complaint", "refund"]],
        ["ip-for-creators", "IP for creators", ["understand copyright", "protect creative work"], ["copyright", "trademark", "creator", "ip"]],
        ["privacy-rights", "Privacy rights", ["request data deletion", "understand privacy"], ["privacy", "data rights", "gdpr", "ccpa"]],
        ["notary-docs", "Notary documents", ["prepare notarization", "check document needs"], ["notary", "notarize", "document", "signature"]],
        ["traffic-tickets", "Traffic tickets", ["understand citation", "prepare response"], ["traffic ticket", "citation", "dmv", "parking ticket"]],
      ],
    },
    {
      superCategory: "RealEstate",
      leaves: [
        ["rent-vs-buy", "Rent vs buy", ["compare rent and buy", "estimate affordability"], ["rent vs buy", "mortgage", "rent", "affordability"]],
        ["apartment-search", "Apartment search", ["find apartments", "compare listings"], ["apartment", "rental", "lease", "listing"]],
        ["mortgage-estimate", "Mortgage estimate", ["estimate mortgage", "compare rates"], ["mortgage", "home loan", "rate", "down payment"]],
        ["home-inspection-qa", "Home inspection QA", ["review inspection", "ask repair questions"], ["home inspection", "inspection", "repair", "property"]],
        ["neighborhood-research", "Neighborhood research", ["compare neighborhoods", "check commute"], ["neighborhood", "schools", "crime", "commute"]],
        ["listing-description", "Listing description", ["write listing", "improve photos copy"], ["real estate listing", "listing", "zillow", "realtor"]],
        ["open-house-scheduler", "Open house scheduler", ["schedule visits", "track showings"], ["open house", "showing", "tour home", "scheduler"]],
        ["hoa-questions", "HOA questions", ["understand HOA rules", "summarize fees"], ["hoa", "homeowners association", "condo", "bylaws"]],
        ["renovation-estimate", "Renovation estimate", ["scope renovation", "estimate costs"], ["renovation", "remodel", "contractor", "estimate"]],
        ["airbnb-host", "Airbnb host", ["optimize listing", "reply to guests"], ["airbnb", "short term rental", "guest", "host"]],
      ],
    },
    {
      superCategory: "Automotive",
      leaves: [
        ["buy-car-research", "Buy car research", ["compare cars", "understand prices"], ["car", "vehicle", "auto", "buy car"]],
        ["maintenance-schedule", "Maintenance schedule", ["track service", "diagnose maintenance"], ["maintenance", "oil change", "service", "mechanic"]],
        ["ev-charging-route", "EV charging route", ["plan charging stops", "compare chargers"], ["ev", "charging", "electric vehicle", "charger"]],
        ["insurance-quote", "Insurance quote", ["compare auto insurance", "understand policy"], ["auto insurance", "car insurance", "quote", "premium"]],
        ["parking-finder", "Parking finder", ["find parking", "compare garages"], ["parking", "garage", "meter", "spot"]],
        ["used-car-inspection", "Used car inspection", ["inspect used car", "check history"], ["used car", "vin", "inspection", "carfax"]],
        ["ride-cost-compare", "Ride cost compare", ["compare rides", "estimate commute cost"], ["rideshare", "uber", "lyft", "ride"]],
        ["dmv-paperwork", "DMV paperwork", ["prepare DMV forms", "renew registration"], ["dmv", "registration", "license", "title"]],
        ["road-safety", "Road safety", ["prepare safe route", "learn driving rules"], ["road safety", "driving", "traffic", "route safety"]],
        ["fleet-family", "Family fleet", ["manage family cars", "track documents"], ["family car", "fleet", "vehicle documents", "registration"]],
      ],
    },
    {
      superCategory: "SportsOutdoors",
      leaves: [
        ["workout-plans", "Workout plans", ["build workouts", "adjust training"], ["workout", "strength", "exercise", "training"]],
        ["running-coach", "Running coach", ["plan runs", "pace workouts"], ["running", "runner", "pace", "5k"]],
        ["hiking-trails", "Hiking trails", ["find trails", "check difficulty"], ["hiking", "trail", "outdoor", "backpacking"]],
        ["sports-betting-info", "Sports betting info", ["compare odds", "understand risk"], ["sports betting", "odds", "wager", "bet"]],
        ["fantasy-sports", "Fantasy sports", ["set lineup", "analyze players"], ["fantasy sports", "fantasy football", "lineup", "draft"]],
        ["ski-conditions", "Ski conditions", ["check snow", "plan ski day"], ["ski", "snowboard", "snow", "resort"]],
        ["fishing-spots", "Fishing spots", ["find fishing areas", "check conditions"], ["fishing", "fish", "angler", "lake"]],
        ["team-schedule-family", "Team schedule family", ["track games", "coordinate rides"], ["team schedule", "soccer", "little league", "sports schedule"]],
        ["outdoor-gear", "Outdoor gear", ["choose gear", "compare equipment"], ["outdoor gear", "camping", "gear", "tent"]],
        ["marathon-training", "Marathon training", ["train for race", "manage mileage"], ["marathon", "race", "training plan", "long run"]],
      ],
    },
    {
      superCategory: "SocialCommunity",
      leaves: [
        ["dating-profile-coach", "Dating profile coach", ["rewrite profile", "choose photos"], ["dating", "profile", "match", "relationship"]],
        ["event-planning-social", "Event planning social", ["plan party", "coordinate guests"], ["party", "event planning", "invite", "rsvp"]],
        ["volunteer-matching", "Volunteer matching", ["find volunteer work", "match causes"], ["volunteer", "charity", "nonprofit", "cause"]],
        ["neighborhood-help", "Neighborhood help", ["find local help", "ask neighbors"], ["neighborhood", "neighbor", "local help", "community"]],
        ["club-organizer", "Club organizer", ["organize club", "schedule meetups"], ["club", "meetup", "organizer", "group"]],
        ["pen-pal-language", "Pen pal language", ["find language partner", "practice messages"], ["pen pal", "language partner", "exchange", "practice"]],
        ["support-groups", "Support groups", ["find support group", "prepare questions"], ["support group", "peer support", "recovery", "community"]],
        ["hobby-clubs", "Hobby clubs", ["find hobby group", "coordinate activities"], ["hobby", "club", "craft group", "activity"]],
        ["civic-engagement", "Civic engagement", ["track local issues", "contact officials"], ["civic", "vote", "city council", "election"]],
        ["alumni-network", "Alumni network", ["find alumni", "plan reunion"], ["alumni", "reunion", "school network", "graduate"]],
      ],
    },
    {
      superCategory: "ProductivityPersonal",
      leaves: [
        ["email-triage-consumer", "Email triage consumer", ["sort personal email", "draft replies"], ["email", "inbox", "gmail", "triage"]],
        ["calendar-optimize", "Calendar optimize", ["schedule day", "protect focus time"], ["calendar", "schedule", "appointment", "time"]],
        ["habit-tracking", "Habit tracking", ["track habits", "build streaks"], ["habit", "routine", "streak", "accountability"]],
        ["goal-accountability", "Goal accountability", ["set goals", "check progress"], ["goal", "accountability", "progress", "coach"]],
        ["journaling", "Journaling", ["reflect daily", "summarize journal"], ["journal", "diary", "reflection", "mood"]],
        ["meeting-notes-personal", "Meeting notes personal", ["summarize calls", "extract tasks"], ["meeting notes", "transcript", "notes", "call"]],
        ["file-organize-home", "File organize home", ["organize documents", "rename files"], ["file organize", "documents", "photos", "folders"]],
        ["password-lessons", "Password lessons", ["learn password safety", "organize accounts"], ["password", "security", "account", "login"]],
        ["focus-pomodoro", "Focus pomodoro", ["run focus sessions", "avoid distractions"], ["focus", "pomodoro", "timer", "distraction"]],
        ["life-admin", "Life admin", ["track paperwork", "manage errands"], ["life admin", "errand", "paperwork", "personal admin"]],
      ],
    },
    {
      superCategory: "CreativeHobbies",
      leaves: [
        ["art-prompt", "Art prompt", ["generate art prompts", "iterate styles"], ["art prompt", "image generation", "drawing", "art"]],
        ["3d-print-design-lite", "3D print design lite", ["make printable models", "fix simple designs"], ["3d print", "stl", "maker", "model"]],
        ["woodworking-plans", "Woodworking plans", ["plan projects", "cut list"], ["woodworking", "wood", "project plan", "carpentry"]],
        ["knitting-patterns", "Knitting patterns", ["adapt pattern", "track rows"], ["knitting", "crochet", "yarn", "pattern"]],
        ["photography-coach", "Photography coach", ["improve photos", "learn camera settings"], ["photography", "camera", "photo", "lens"]],
        ["songwriting", "Songwriting", ["write lyrics", "shape melody ideas"], ["songwriting", "song", "lyrics", "music"]],
        ["meme-maker", "Meme maker", ["make memes", "caption images"], ["meme", "caption", "viral", "image"]],
        ["scrapbook", "Scrapbook", ["design pages", "organize memories"], ["scrapbook", "memory", "album", "craft"]],
        ["calligraphy", "Calligraphy", ["practice lettering", "plan invitations"], ["calligraphy", "lettering", "handwriting", "ink"]],
        ["diy-crafts", "DIY crafts", ["plan crafts", "adapt materials"], ["diy", "craft", "make", "handmade"]],
      ],
    },
  ];

  return groups.flatMap((group) =>
    group.leaves.map(([slug, label, consumerUseCases, keywords]) => ({
      super_category: group.superCategory,
      niche_id: `${group.superCategory}/${slug}`,
      niche_label: `${group.superCategory} - ${label}`,
      consumer_use_cases: consumerUseCases,
      keywords,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
