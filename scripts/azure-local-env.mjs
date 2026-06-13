#!/usr/bin/env node

import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";

const DEFAULT_FILE = ".env.local";
const APPLY = process.argv.includes("--apply");
const REDACT_KEYS = /(?:API_KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD)$/;

function usage() {
  console.log(`Usage:
  npm run azure:local -- status
  npm run azure:local -- off
  npm run azure:local -- off --apply
  npm run azure:local -- azure-openai --apply
  npm run azure:local -- foundry --apply

Options:
  --file <path>              Default: .env.local
  --no-backup                Do not create a timestamped backup on --apply
  --materialize-secret       Write API keys from the current shell env if present

Dry-run is the default. The script preserves unrelated .env.local lines and
only upserts the Arbor Azure/Foundry switch keys.
`);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function command() {
  const value = process.argv.slice(2).find((item) => !item.startsWith("--")) ?? "status";
  if (["status", "off", "azure-openai", "azure", "foundry"].includes(value)) {
    return value === "azure" ? "azure-openai" : value;
  }
  throw new Error(`Unknown command "${value}". Use status, off, azure-openai, or foundry.`);
}

function cleanEnvValue(value) {
  const trimmed = String(value ?? "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function quoteValue(value) {
  const text = String(value);
  if (!text || /[\s#'"\\]/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function parseEnv(raw) {
  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values.set(match[1], cleanEnvValue(match[2]));
  }
  return values;
}

function envValue(values, key, fallback = "") {
  const shell = cleanEnvValue(process.env[key] ?? "");
  if (shell) return shell;
  return values.get(key) || fallback;
}

function redacted(key, value) {
  if (!value) return "(missing)";
  if (!REDACT_KEYS.test(key)) return value;
  if (value.startsWith("<") && value.endsWith(">")) return value;
  return value.length <= 8 ? "***" : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function readEnvFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function azureOpenAIUpdates(values) {
  const materializeSecret = process.argv.includes("--materialize-secret");
  const updates = {
    ARBOR_MODEL_PROVIDER: "azure-openai",
    ARBOR_AZURE_ENABLED: "true",
    ARBOR_REQUIRE_AZURE: "true",
    ARBOR_MODEL_SPEND_DISABLED: "false",
    AZURE_OPENAI_ENDPOINT: envValue(values, "AZURE_OPENAI_ENDPOINT", "https://<resource>.openai.azure.com"),
    AZURE_OPENAI_API_MODE: envValue(values, "AZURE_OPENAI_API_MODE", "responses"),
    AZURE_OPENAI_API_VERSION: envValue(values, "AZURE_OPENAI_API_VERSION", "2024-10-21"),
    AZURE_OPENAI_AGENT_DEPLOYMENT: envValue(values, "AZURE_OPENAI_AGENT_DEPLOYMENT", "gpt5-agent"),
    AZURE_OPENAI_JUDGE_DEPLOYMENT: envValue(values, "AZURE_OPENAI_JUDGE_DEPLOYMENT", "arbor-judge-base"),
    AZURE_OPENAI_SUGGESTER_DEPLOYMENT: envValue(values, "AZURE_OPENAI_SUGGESTER_DEPLOYMENT", "arbor-suggester-base"),
  };
  const existingKey = values.get("AZURE_OPENAI_API_KEY") || "";
  const shellKey = cleanEnvValue(process.env.AZURE_OPENAI_API_KEY ?? "");
  if (materializeSecret && shellKey) updates.AZURE_OPENAI_API_KEY = shellKey;
  else if (existingKey) updates.AZURE_OPENAI_API_KEY = existingKey;
  return updates;
}

function foundryUpdates(values) {
  const materializeSecret = process.argv.includes("--materialize-secret");
  const updates = {
    ARBOR_MODEL_PROVIDER: "foundry",
    ARBOR_AZURE_ENABLED: "true",
    ARBOR_REQUIRE_AZURE: "true",
    ARBOR_MODEL_SPEND_DISABLED: "false",
    AZURE_FOUNDRY_ENDPOINT: envValue(
      values,
      "AZURE_FOUNDRY_ENDPOINT",
      envValue(values, "AZURE_AI_FOUNDRY_ENDPOINT", "https://<resource>.services.ai.azure.com"),
    ),
    AZURE_FOUNDRY_API_VERSION: envValue(values, "AZURE_FOUNDRY_API_VERSION", "2024-10-21"),
    AZURE_FOUNDRY_AGENT_DEPLOYMENT: envValue(
      values,
      "AZURE_FOUNDRY_AGENT_DEPLOYMENT",
      envValue(values, "AZURE_FOUNDRY_DEPLOYMENT", "<foundry-deployment>"),
    ),
    AZURE_FOUNDRY_JUDGE_DEPLOYMENT: envValue(
      values,
      "AZURE_FOUNDRY_JUDGE_DEPLOYMENT",
      envValue(values, "AZURE_FOUNDRY_DEPLOYMENT", "<foundry-deployment>"),
    ),
    AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT: envValue(
      values,
      "AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT",
      envValue(values, "AZURE_FOUNDRY_DEPLOYMENT", "<foundry-deployment>"),
    ),
  };
  const existingKey = values.get("AZURE_FOUNDRY_API_KEY") || values.get("AZURE_INFERENCE_CREDENTIAL") || "";
  const shellKey =
    cleanEnvValue(process.env.AZURE_FOUNDRY_API_KEY ?? "") ||
    cleanEnvValue(process.env.AZURE_INFERENCE_CREDENTIAL ?? "");
  if (materializeSecret && shellKey) updates.AZURE_FOUNDRY_API_KEY = shellKey;
  else if (existingKey) updates.AZURE_FOUNDRY_API_KEY = existingKey;
  return updates;
}

function offUpdates() {
  return {
    ARBOR_MODEL_PROVIDER: "disabled",
    ARBOR_AZURE_ENABLED: "false",
    ARBOR_REQUIRE_AZURE: "true",
    ARBOR_MODEL_SPEND_DISABLED: "true",
  };
}

function updatesFor(commandName, values) {
  if (commandName === "off") return offUpdates();
  if (commandName === "foundry") return foundryUpdates(values);
  if (commandName === "azure-openai") return azureOpenAIUpdates(values);
  return {};
}

function applyUpdates(raw, updates) {
  const lines = raw ? raw.split(/\r?\n/) : [];
  const seen = new Set();
  const rewritten = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Z0-9_]+)\s*=.*$/);
    if (!match) return line;
    const key = match[2];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${quoteValue(updates[key])}`;
  });
  if (rewritten.length && rewritten[rewritten.length - 1] !== "") rewritten.push("");
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) rewritten.push(`${key}=${quoteValue(value)}`);
  }
  return rewritten.join("\n").replace(/\n{3,}$/g, "\n\n");
}

function printStatus(values) {
  const keys = [
    "ARBOR_MODEL_PROVIDER",
    "ARBOR_AZURE_ENABLED",
    "ARBOR_REQUIRE_AZURE",
    "ARBOR_MODEL_SPEND_DISABLED",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_AGENT_DEPLOYMENT",
    "AZURE_OPENAI_JUDGE_DEPLOYMENT",
    "AZURE_OPENAI_SUGGESTER_DEPLOYMENT",
    "AZURE_FOUNDRY_ENDPOINT",
    "AZURE_FOUNDRY_AGENT_DEPLOYMENT",
    "AZURE_FOUNDRY_JUDGE_DEPLOYMENT",
    "AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT",
  ];
  for (const key of keys) {
    console.log(`${key}=${redacted(key, values.get(key) || "")}`);
  }
}

function printPlan(updates) {
  for (const [key, value] of Object.entries(updates)) {
    console.log(`${key}=${redacted(key, value)}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  const path = arg("file", DEFAULT_FILE);
  const raw = await readEnvFile(path);
  const values = parseEnv(raw);
  const cmd = command();
  if (cmd === "status") {
    printStatus(values);
    return;
  }

  const updates = updatesFor(cmd, values);
  console.log(`# ${APPLY ? "applying" : "dry run"} ${cmd} to ${path}`);
  printPlan(updates);
  if (!APPLY) {
    console.log("# add --apply to write the file");
    return;
  }

  if (existsSync(path) && !process.argv.includes("--no-backup")) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `${path}.azure-backup-${stamp}`;
    await copyFile(path, backup);
    console.log(`wrote backup ${backup}`);
  }

  const next = applyUpdates(raw, updates);
  await writeFile(path, next.endsWith("\n") ? next : `${next}\n`, "utf8");
  console.log(`wrote ${path}`);
  console.log("run: npm run model:smoke -- agent");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
