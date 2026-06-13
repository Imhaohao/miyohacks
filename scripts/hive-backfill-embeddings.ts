// Usage: npm run hive:backfill
//
// Backfills the hive registry: enumerates the static SPECIALISTS roster, the
// curated MCP_CATALOG, and every discovered_specialists row, then calls
// api.hiveRegistry.registerAgent (with fetch_tools:false) for each so every
// existing agent gets a hive_agent_embeddings row + a scheduled eval gate.
//
// Resolves NEXT_PUBLIC_CONVEX_URL from the environment, falling back to a
// parsed .env.local. Runs sequentially with a small delay so the eval-gate
// fan-out does not stampede. Prints a summary table at the end.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { HiveAgentRegistration } from "../lib/hive/registry-core";
import { SPECIALISTS } from "../lib/specialists/registry";
import { MCP_CATALOG } from "../lib/specialists/catalog";

const CALL_DELAY_MS = 200;
const DEFAULT_REPUTATION = 0.55;

function resolveConvexUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (fromEnv) return fromEnv;

  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const match = line.match(/^\s*NEXT_PUBLIC_CONVEX_URL\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1).trim();
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      if (value) return value;
    }
  } catch {
    // .env.local is optional; fall through to the error below.
  }

  console.error(
    "NEXT_PUBLIC_CONVEX_URL is not set and could not be read from .env.local.\n" +
      "Set it in the environment or add it to .env.local and re-run npm run hive:backfill.",
  );
  process.exit(1);
}

/** Optional string-valued fields of a HiveAgentRegistration. */
type OptionalStringKey =
  | "mcp_endpoint"
  | "mcp_api_key_env"
  | "a2a_endpoint"
  | "a2a_agent_card_url"
  | "a2a_api_key_env"
  | "homepage_url";

/** Only attach an optional string field when it has a real value. */
function withOptional(
  target: HiveAgentRegistration,
  key: OptionalStringKey,
  value: string | undefined | null,
): void {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed) target[key] = trimmed;
}

function fromSpecialists(): HiveAgentRegistration[] {
  return SPECIALISTS.map((cfg) => {
    const reg: HiveAgentRegistration = {
      agent_id: cfg.agent_id,
      display_name: cfg.display_name,
      sponsor: cfg.sponsor,
      owner_id: cfg.sponsor,
      capabilities: cfg.capabilities,
      one_liner: cfg.one_liner || `${cfg.display_name} by ${cfg.sponsor}`,
      system_prompt: cfg.system_prompt || "",
      cost_baseline: cfg.cost_baseline ?? 0.5,
      starting_reputation: cfg.starting_reputation ?? DEFAULT_REPUTATION,
      fetch_tools: false,
    };
    withOptional(reg, "mcp_endpoint", cfg.mcp_endpoint);
    withOptional(reg, "mcp_api_key_env", cfg.mcp_api_key_env);
    withOptional(reg, "a2a_endpoint", cfg.a2a_endpoint);
    withOptional(reg, "a2a_agent_card_url", cfg.a2a_agent_card_url);
    withOptional(reg, "a2a_api_key_env", cfg.a2a_api_key_env);
    withOptional(reg, "homepage_url", cfg.homepage_url);
    return reg;
  });
}

function fromCatalog(): HiveAgentRegistration[] {
  return MCP_CATALOG.map((entry) => {
    const reg: HiveAgentRegistration = {
      agent_id: entry.agent_id,
      display_name: entry.display_name,
      sponsor: entry.sponsor,
      owner_id: entry.sponsor,
      capabilities: entry.capabilities,
      one_liner: entry.one_liner || `${entry.display_name} by ${entry.sponsor}`,
      system_prompt: `You are ${entry.display_name}, an MCP-equipped specialist for ${entry.sponsor}. Your remote tools cover: ${entry.capabilities.join(", ")}. ${entry.one_liner}`,
      cost_baseline: entry.cost_baseline ?? 0.5,
      starting_reputation: DEFAULT_REPUTATION,
      fetch_tools: false,
    };
    withOptional(reg, "mcp_endpoint", entry.mcp_endpoint);
    withOptional(reg, "mcp_api_key_env", entry.mcp_api_key_env);
    withOptional(reg, "homepage_url", entry.homepage_url);
    return reg;
  });
}

interface DiscoveredRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  capabilities: string[];
  system_prompt: string;
  cost_baseline: number;
  starting_reputation: number;
  one_liner: string;
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  homepage_url?: string;
  owner_id?: string;
}

function fromDiscovered(rows: DiscoveredRow[]): HiveAgentRegistration[] {
  return rows.map((row) => {
    const reg: HiveAgentRegistration = {
      agent_id: row.agent_id,
      display_name: row.display_name,
      sponsor: row.sponsor,
      owner_id: row.owner_id ?? row.sponsor,
      capabilities: row.capabilities,
      one_liner: row.one_liner || `${row.display_name} by ${row.sponsor}`,
      system_prompt: row.system_prompt || "",
      cost_baseline: row.cost_baseline ?? 0.5,
      starting_reputation: row.starting_reputation ?? DEFAULT_REPUTATION,
      fetch_tools: false,
    };
    withOptional(reg, "mcp_endpoint", row.mcp_endpoint);
    withOptional(reg, "mcp_api_key_env", row.mcp_api_key_env);
    withOptional(reg, "a2a_endpoint", row.a2a_endpoint);
    withOptional(reg, "a2a_agent_card_url", row.a2a_agent_card_url);
    withOptional(reg, "a2a_api_key_env", row.a2a_api_key_env);
    withOptional(reg, "homepage_url", row.homepage_url);
    return reg;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const convexUrl = resolveConvexUrl();
  const client = new ConvexHttpClient(convexUrl);

  const staticRegs = fromSpecialists();
  const catalogRegs = fromCatalog();
  const discoveredRows = (await client.query(
    api.discoveredSpecialists.list,
    {},
  )) as DiscoveredRow[];
  const discoveredRegs = fromDiscovered(discoveredRows);

  // De-duplicate by agent_id with precedence: discovered > static > catalog.
  // discovered rows are the live source of truth.
  const byId = new Map<string, HiveAgentRegistration>();
  for (const reg of catalogRegs) byId.set(reg.agent_id, reg);
  for (const reg of staticRegs) byId.set(reg.agent_id, reg);
  for (const reg of discoveredRegs) byId.set(reg.agent_id, reg);
  const worklist = Array.from(byId.values());

  console.log("Hive registry backfill");
  console.log(`  Convex:     ${convexUrl}`);
  console.log(`  static:     ${staticRegs.length}`);
  console.log(`  catalog:    ${catalogRegs.length}`);
  console.log(`  discovered: ${discoveredRegs.length}`);
  console.log(`  deduped:    ${worklist.length}`);
  console.log("");

  let succeeded = 0;
  const failures: Array<{ agent_id: string; error: string }> = [];

  for (const reg of worklist) {
    try {
      await client.action(api.hiveRegistry.registerAgent, {
        ...reg,
        fetch_tools: false,
      });
      succeeded += 1;
      console.log(`  ok    ${reg.agent_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ agent_id: reg.agent_id, error: message });
      console.log(`  FAIL  ${reg.agent_id}: ${message.split("\n")[0]}`);
    }
    await sleep(CALL_DELAY_MS);
  }

  console.log("");
  console.log("Summary");
  console.log(`  total:     ${worklist.length}`);
  console.log(`  succeeded: ${succeeded}`);
  console.log(`  failed:    ${failures.length}`);
  for (const f of failures) {
    console.log(`    - ${f.agent_id}: ${f.error.split("\n")[0]}`);
  }
  console.log("");
  console.log(
    "Eval gates run asynchronously. Poll searchAgents (include_unevaluated:false)",
  );
  console.log("until each agent's eval_status flips to passed.");

  process.exit(failures.length > 0 && succeeded === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
