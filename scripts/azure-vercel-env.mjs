#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const ALLOW_PLACEHOLDERS = process.argv.includes("--allow-placeholders");
const DEFAULT_ENVS = ["production", "preview", "development"];
const SENSITIVE = /(?:API_KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD)$/;

async function loadEnvLocal() {
  try {
    const raw = await readFile(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1).trim();
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      process.env[key] =
        process.env[key]?.trim().replace(/\s+#.*$/, "").trim() || value;
    }
  } catch {
    // Optional.
  }
}

function usage() {
  console.log(`Usage:
  npm run azure:vercel -- azure-openai
  npm run azure:vercel -- azure-openai --apply
  npm run azure:vercel -- foundry --apply
  npm run azure:vercel -- off --apply
  npm run azure:vercel -- list

Options:
  --env <production,preview,development>  Repeat or comma-separate. Default: all three.
  --materialize-secret                    Use API keys from the current shell or .env.local.
  --allow-placeholders                    Permit placeholder values on --apply.

Dry-run is the default. --apply uses Vercel CLI and writes env vars with
\`vercel env add --force\`.
`);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function args(name) {
  const values = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] !== `--${name}` || i === process.argv.length - 1) continue;
    values.push(...process.argv[i + 1].split(",").map((value) => value.trim()).filter(Boolean));
  }
  return values;
}

function command() {
  const value = process.argv.slice(2).find((item) => !item.startsWith("--")) ?? "azure-openai";
  if (["azure", "azure-openai", "foundry", "off", "list"].includes(value)) {
    return value === "azure" ? "azure-openai" : value;
  }
  throw new Error(`Unknown command "${value}". Use azure-openai, foundry, off, or list.`);
}

function env(name, fallback = "") {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function environments() {
  const selected = args("env");
  return selected.length ? selected : DEFAULT_ENVS;
}

function redacted(key, value) {
  if (!value) return "(missing)";
  if (!SENSITIVE.test(key)) return value;
  if (value.startsWith("<") && value.endsWith(">")) return value;
  return value.length <= 8 ? "***" : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isPlaceholder(value) {
  return typeof value === "string" && /^<[^>]+>$/.test(value.trim());
}

function azureOpenAIValues() {
  const materializeSecret = process.argv.includes("--materialize-secret");
  return {
    ARBOR_MODEL_PROVIDER: "azure-openai",
    ARBOR_AZURE_ENABLED: "true",
    ARBOR_REQUIRE_AZURE: "true",
    ARBOR_MODEL_SPEND_DISABLED: "false",
    AZURE_OPENAI_ENDPOINT: env("AZURE_OPENAI_ENDPOINT", "https://<resource>.openai.azure.com"),
    AZURE_OPENAI_API_KEY:
      materializeSecret && env("AZURE_OPENAI_API_KEY")
        ? env("AZURE_OPENAI_API_KEY")
        : env("AZURE_OPENAI_API_KEY", "<AZURE_OPENAI_API_KEY>"),
    AZURE_OPENAI_API_MODE: env("AZURE_OPENAI_API_MODE", "responses"),
    AZURE_OPENAI_API_VERSION: env("AZURE_OPENAI_API_VERSION", "2024-10-21"),
    AZURE_OPENAI_AGENT_DEPLOYMENT: env("AZURE_OPENAI_AGENT_DEPLOYMENT", "gpt5-agent"),
    AZURE_OPENAI_JUDGE_DEPLOYMENT: env("AZURE_OPENAI_JUDGE_DEPLOYMENT", "arbor-judge-base"),
    AZURE_OPENAI_SUGGESTER_DEPLOYMENT: env(
      "AZURE_OPENAI_SUGGESTER_DEPLOYMENT",
      "arbor-suggester-base",
    ),
  };
}

function foundryValues() {
  const materializeSecret = process.argv.includes("--materialize-secret");
  const key = env("AZURE_FOUNDRY_API_KEY") || env("AZURE_INFERENCE_CREDENTIAL");
  const deployment = env("AZURE_FOUNDRY_DEPLOYMENT", "<foundry-deployment>");
  return {
    ARBOR_MODEL_PROVIDER: "foundry",
    ARBOR_AZURE_ENABLED: "true",
    ARBOR_REQUIRE_AZURE: "true",
    ARBOR_MODEL_SPEND_DISABLED: "false",
    AZURE_FOUNDRY_ENDPOINT: env(
      "AZURE_FOUNDRY_ENDPOINT",
      env("AZURE_AI_FOUNDRY_ENDPOINT", "https://<resource>.services.ai.azure.com"),
    ),
    AZURE_FOUNDRY_API_KEY:
      materializeSecret && key ? key : env("AZURE_FOUNDRY_API_KEY", "<AZURE_FOUNDRY_API_KEY>"),
    AZURE_FOUNDRY_API_VERSION: env("AZURE_FOUNDRY_API_VERSION", "2024-10-21"),
    AZURE_FOUNDRY_AGENT_DEPLOYMENT: env("AZURE_FOUNDRY_AGENT_DEPLOYMENT", deployment),
    AZURE_FOUNDRY_JUDGE_DEPLOYMENT: env("AZURE_FOUNDRY_JUDGE_DEPLOYMENT", deployment),
    AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT: env("AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT", deployment),
  };
}

function offValues() {
  return {
    ARBOR_MODEL_PROVIDER: "disabled",
    ARBOR_AZURE_ENABLED: "false",
    ARBOR_REQUIRE_AZURE: "true",
    ARBOR_MODEL_SPEND_DISABLED: "true",
  };
}

function valuesFor(cmd) {
  if (cmd === "off") return offValues();
  if (cmd === "foundry") return foundryValues();
  return azureOpenAIValues();
}

function runVercel(args, input = "") {
  console.log(`$ ${args.join(" ")}`);
  if (!APPLY) return;
  const result = spawnSync(args[0], args.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    input,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw new Error(`${args[0]} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${args[0]} exited with ${result.status}`);
}

function addEnv(key, value, target) {
  const args = ["npx", "vercel", "env", "add", key, target, "--force"];
  if (SENSITIVE.test(key)) args.push("--sensitive");
  runVercel(args, `${value}\n`);
}

function assertNoPlaceholders(values) {
  if (!APPLY || ALLOW_PLACEHOLDERS) return;
  const placeholders = Object.entries(values)
    .filter(([, value]) => isPlaceholder(value))
    .map(([key, value]) => `${key}=${value}`);
  if (placeholders.length > 0) {
    throw new Error(
      `Refusing to apply placeholder Vercel env values: ${placeholders.join(", ")}. Set real values or pass --allow-placeholders intentionally.`,
    );
  }
}

function listEnv(target) {
  runVercel(["npx", "vercel", "env", "list", target]);
}

async function main() {
  await loadEnvLocal();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  const cmd = command();
  const targets = environments();
  if (cmd === "list") {
    for (const target of targets) listEnv(target);
    return;
  }

  const values = valuesFor(cmd);
  assertNoPlaceholders(values);
  console.log(`# ${APPLY ? "applying" : "dry run"} Vercel ${cmd} env for ${targets.join(", ")}`);
  for (const target of targets) {
    console.log(`\n# ${target}`);
    for (const [key, value] of Object.entries(values)) {
      console.log(`${key}=${redacted(key, value)}`);
      addEnv(key, value, target);
    }
  }
  if (!APPLY) console.log("\n# add --apply to write Vercel env vars");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
