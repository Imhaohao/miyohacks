import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = "/Users/yanzihao/Documents/miyohacks/research/agent-corpus";
const TODAY = "2026-06-11";

const headers = [
  "protocol",
  "name",
  "company",
  "finding_status",
  "endpoint_url",
  "card_or_docs_url",
  "homepage_or_source_url",
  "auth_required",
  "niche_or_category",
  "evidence",
  "source_sheet",
  "discovery_date",
  "notes",
];

const mcpRows = [];
const a2aRows = [];

const corpus = await readJson("agents-corpus.json");
for (const row of corpus) {
  if (row.invocation_type !== "mcp") continue;
  mcpRows.push({
    protocol: "mcp",
    name: row.display_name,
    company: row.company,
    finding_status: row.verification_status,
    endpoint_url: row.endpoint_or_docs_url,
    card_or_docs_url: "",
    homepage_or_source_url: row.homepage_url,
    auth_required: row.auth_required,
    niche_or_category: row.niche_id,
    evidence: row.verification_evidence,
    source_sheet: "agents-corpus.json",
    discovery_date: row.discovery_date,
    notes: row.notes,
  });
}

const overflow = await readJson("overflow-agents.json");
for (const row of overflow) {
  if (row.invocation_type !== "mcp") continue;
  mcpRows.push({
    protocol: "mcp",
    name: row.display_name,
    company: row.company,
    finding_status: "overflow_partial",
    endpoint_url: row.endpoint_or_docs_url,
    card_or_docs_url: "",
    homepage_or_source_url: row.homepage_url,
    auth_required: row.auth_required,
    niche_or_category: row.niche_id,
    evidence: row.verification_evidence,
    source_sheet: "overflow-agents.json",
    discovery_date: row.discovery_date,
    notes: `${row.notes} ${row.overflow_reason ?? ""}`.trim(),
  });
}

const a2aCards = await readJson("a2a-agent-cards.json");
for (const row of a2aCards) {
  a2aRows.push({
    protocol: "a2a",
    name: row.display_name,
    company: row.provider,
    finding_status: row.verification_status,
    endpoint_url: row.declared_a2a_endpoint,
    card_or_docs_url: row.agent_card_url,
    homepage_or_source_url: row.discovery_source,
    auth_required: row.auth_required,
    niche_or_category: row.niche_guess,
    evidence: row.verification_evidence,
    source_sheet: "a2a-agent-cards.json",
    discovery_date: row.discovery_date,
    notes: `${row.card_location_type}; skills=${row.skill_count}; ${row.notes}`,
  });
}

const yc = await readJson("yc-ai-mcp-a2a.json");
for (const row of yc) {
  const protocolType = String(row.protocol_type ?? "").toLowerCase();
  if (protocolType.includes("mcp")) {
    mcpRows.push({
      protocol: "mcp",
      name: row.company,
      company: row.company,
      finding_status: row.status,
      endpoint_url: looksLikeEndpoint(row.endpoint_or_docs_url)
        ? row.endpoint_or_docs_url
        : "",
      card_or_docs_url: looksLikeEndpoint(row.endpoint_or_docs_url)
        ? ""
        : row.endpoint_or_docs_url,
      homepage_or_source_url: row.yc_url,
      auth_required: "unknown",
      niche_or_category: row.protocol_role,
      evidence: row.evidence,
      source_sheet: "yc-ai-mcp-a2a.json",
      discovery_date: TODAY,
      notes: row.notes,
    });
  }
  if (protocolType.includes("a2a")) {
    a2aRows.push({
      protocol: "a2a",
      name: row.company,
      company: row.company,
      finding_status: row.status,
      endpoint_url: "",
      card_or_docs_url: row.endpoint_or_docs_url,
      homepage_or_source_url: row.yc_url,
      auth_required: "unknown",
      niche_or_category: row.protocol_role,
      evidence: row.evidence,
      source_sheet: "yc-ai-mcp-a2a.json",
      discovery_date: TODAY,
      notes: row.notes,
    });
  }
}

const expanded = await readJson("expanded-agent-companies.json");
for (const row of expanded) {
  const protocol = String(row.protocol_or_invocation ?? "").toLowerCase();
  if (protocol.includes("mcp")) {
    mcpRows.push({
      protocol: "mcp",
      name: row.product,
      company: row.company,
      finding_status: row.verification_status,
      endpoint_url: "",
      card_or_docs_url: row.evidence_url,
      homepage_or_source_url: row.evidence_url,
      auth_required: "unknown",
      niche_or_category: row.category,
      evidence: row.evidence_summary,
      source_sheet: "expanded-agent-companies.json",
      discovery_date: row.discovery_date,
      notes: row.notes,
    });
  }
  if (protocol.includes("a2a")) {
    a2aRows.push({
      protocol: "a2a",
      name: row.product,
      company: row.company,
      finding_status: row.verification_status,
      endpoint_url: "",
      card_or_docs_url: row.evidence_url,
      homepage_or_source_url: row.evidence_url,
      auth_required: "unknown",
      niche_or_category: row.category,
      evidence: row.evidence_summary,
      source_sheet: "expanded-agent-companies.json",
      discovery_date: row.discovery_date,
      notes: row.notes,
    });
  }
}

mcpRows.sort(compareRows);
a2aRows.sort(compareRows);

await writeFile(path.join(ROOT, "compiled-mcp-findings.csv"), toCsv(mcpRows));
await writeFile(path.join(ROOT, "compiled-a2a-findings.csv"), toCsv(a2aRows));
await writeFile(path.join(ROOT, "compiled-protocol-findings-audit.md"), audit());

console.log(
  `compiled ${mcpRows.length} MCP findings and ${a2aRows.length} A2A findings`,
);

async function readJson(file) {
  const fullPath = path.join(ROOT, file);
  let raw;
  try {
    raw = await readFile(fullPath, "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(`Missing required input ${fullPath}. Generate it before compiling protocol findings.`);
    }
    throw new Error(`Could not read ${fullPath}: ${err?.message ?? String(err)}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${fullPath}: ${err?.message ?? String(err)}`);
  }
}

function looksLikeEndpoint(value) {
  return /^https?:\/\/.+\/(mcp|sse|a2a|api)(\/|$)/i.test(String(value ?? ""));
}

function compareRows(a, b) {
  return (
    a.source_sheet.localeCompare(b.source_sheet) ||
    a.company.localeCompare(b.company) ||
    a.name.localeCompare(b.name) ||
    a.endpoint_url.localeCompare(b.endpoint_url)
  );
}

function toCsv(rows) {
  return `${headers.join(",")}\n${rows
    .map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    .join("\n")}\n`;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function audit() {
  return `# Compiled Protocol Findings Audit

Generated: ${TODAY}

## Outputs

| File | Rows | Scope |
|---|---:|---|
| compiled-mcp-findings.csv | ${mcpRows.length} | MCP registry corpus, MCP overflow, YC MCP findings, broad MCP-related agent-company rows |
| compiled-a2a-findings.csv | ${a2aRows.length} | A2A card sweep plus YC A2A/watchlist findings |

## Notes

- MCP overflow rows are included because they are valid findings excluded only by the capped-corpus 10-per-niche rule.
- A2A rows include both verified card rows and YC watchlist rows where A2A/agent-to-agent evidence exists but no card was found.
- \`finding_status\` is the key trust field. Treat \`verified_live_card\`, \`verified_repo_card\`, and \`partial\` differently from \`watchlist_*\` or \`*_docs_only\`.
- These compiled CSVs preserve duplicate companies across source sheets when the evidence source differs.
`;
}
