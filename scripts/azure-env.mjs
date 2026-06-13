#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
      process.env[key] = process.env[key]?.trim().replace(/\s+#.*$/, "").trim() || value;
    }
  } catch {
    // Optional.
  }
}

function usage() {
  console.log(`Usage:
  npm run azure:env
  npm run azure:env -- print
  npm run azure:env -- convex
  npm run azure:env -- convex --apply
  npm run azure:env -- devtools
  npm run azure:env -- devtools --provider foundry
  npm run azure:env -- devtools --format dotenv --output .env.azure-devtools
  npm run azure:env -- devtools --format json

Reads AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and deployment names from env.
Deployment defaults:
  AZURE_OPENAI_AGENT_DEPLOYMENT=gpt5-agent
  AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge-base
  AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester-base
`);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function value(name, fallback = "") {
  return arg(name.toLowerCase().replace(/_/g, "-"), process.env[name] ?? fallback);
}

function normalizeEndpoint(endpoint) {
  return endpoint.trim().replace(/\/+$/, "").replace(/\/openai\/v1$/i, "");
}

function q(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function jsonString(value) {
  return JSON.stringify(value, null, 2);
}

function convexEnvPrefix() {
  const deployment = value("CONVEX_DEPLOYMENT", "").trim();
  return deployment
    ? ["npx", "convex", "env", "--deployment", deployment]
    : ["npx", "convex", "env"];
}

function buildConfig() {
  const requestedProvider = arg(
    "provider",
    value(
      "ARBOR_MODEL_PROVIDER",
      process.env.ARBOR_MODEL_PROVIDER === "foundry" ? "foundry" : "azure-openai",
    ),
  );
  const provider = requestedProvider === "foundry" ? "foundry" : "azure-openai";
  if (provider === "foundry") {
    const endpoint = normalizeEndpoint(
      value(
        "AZURE_FOUNDRY_ENDPOINT",
        process.env.AZURE_AI_FOUNDRY_ENDPOINT ??
          "https://<resource>.services.ai.azure.com",
      ),
    );
    return {
      provider,
      endpoint,
      apiKey:
        value("AZURE_FOUNDRY_API_KEY", "") ||
        value("AZURE_INFERENCE_CREDENTIAL", ""),
      apiMode: "chat",
      apiVersion: value("AZURE_FOUNDRY_API_VERSION", "2024-10-21"),
      agent:
        value("AZURE_FOUNDRY_AGENT_DEPLOYMENT", "") ||
        value("AZURE_FOUNDRY_DEPLOYMENT", "<foundry-deployment>"),
      judge:
        value("AZURE_FOUNDRY_JUDGE_DEPLOYMENT", "") ||
        value("AZURE_FOUNDRY_DEPLOYMENT", "<foundry-deployment>"),
      suggester:
        value("AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT", "") ||
        value("AZURE_FOUNDRY_DEPLOYMENT", "<foundry-deployment>"),
    };
  }

  const endpoint = normalizeEndpoint(
    value("AZURE_OPENAI_ENDPOINT", "https://<resource>.openai.azure.com"),
  );
  return {
    provider,
    endpoint,
    apiKey: value("AZURE_OPENAI_API_KEY", ""),
    apiMode: value("AZURE_OPENAI_API_MODE", "responses"),
    apiVersion: value("AZURE_OPENAI_API_VERSION", "2024-10-21"),
    agent: value("AZURE_OPENAI_AGENT_DEPLOYMENT", "gpt5-agent"),
    judge: value("AZURE_OPENAI_JUDGE_DEPLOYMENT", "arbor-judge-base"),
    suggester: value("AZURE_OPENAI_SUGGESTER_DEPLOYMENT", "arbor-suggester-base"),
  };
}

function envLines(cfg, includeSecret = true) {
  if (cfg.provider === "foundry") {
    return [
      "ARBOR_MODEL_PROVIDER=foundry",
      "ARBOR_AZURE_ENABLED=true",
      "ARBOR_REQUIRE_AZURE=true",
      "ARBOR_MODEL_SPEND_DISABLED=false",
      `AZURE_FOUNDRY_ENDPOINT=${cfg.endpoint}`,
      `AZURE_FOUNDRY_API_KEY=${includeSecret && cfg.apiKey ? cfg.apiKey : "<AZURE_FOUNDRY_API_KEY>"}`,
      `AZURE_FOUNDRY_API_VERSION=${cfg.apiVersion}`,
      `AZURE_FOUNDRY_AGENT_DEPLOYMENT=${cfg.agent}`,
      `AZURE_FOUNDRY_JUDGE_DEPLOYMENT=${cfg.judge}`,
      `AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT=${cfg.suggester}`,
    ];
  }
  return [
    "ARBOR_MODEL_PROVIDER=azure-openai",
    "ARBOR_AZURE_ENABLED=true",
    "ARBOR_REQUIRE_AZURE=true",
    "ARBOR_MODEL_SPEND_DISABLED=false",
    `AZURE_OPENAI_ENDPOINT=${cfg.endpoint}`,
    `AZURE_OPENAI_API_KEY=${includeSecret && cfg.apiKey ? cfg.apiKey : "<AZURE_OPENAI_API_KEY>"}`,
    `AZURE_OPENAI_API_MODE=${cfg.apiMode}`,
    `AZURE_OPENAI_API_VERSION=${cfg.apiVersion}`,
    `AZURE_OPENAI_AGENT_DEPLOYMENT=${cfg.agent}`,
    `AZURE_OPENAI_JUDGE_DEPLOYMENT=${cfg.judge}`,
    `AZURE_OPENAI_SUGGESTER_DEPLOYMENT=${cfg.suggester}`,
  ];
}

function convexCommands(cfg, includeSecret = true) {
  const pairs = cfg.provider === "foundry" ? [
    ["ARBOR_MODEL_PROVIDER", "foundry"],
    ["ARBOR_AZURE_ENABLED", "true"],
    ["ARBOR_REQUIRE_AZURE", "true"],
    ["ARBOR_MODEL_SPEND_DISABLED", "false"],
    ["AZURE_FOUNDRY_ENDPOINT", cfg.endpoint],
    ["AZURE_FOUNDRY_API_VERSION", cfg.apiVersion],
    ["AZURE_FOUNDRY_AGENT_DEPLOYMENT", cfg.agent],
    ["AZURE_FOUNDRY_JUDGE_DEPLOYMENT", cfg.judge],
    ["AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT", cfg.suggester],
  ] : [
    ["ARBOR_MODEL_PROVIDER", "azure-openai"],
    ["ARBOR_AZURE_ENABLED", "true"],
    ["ARBOR_REQUIRE_AZURE", "true"],
    ["ARBOR_MODEL_SPEND_DISABLED", "false"],
    ["AZURE_OPENAI_ENDPOINT", cfg.endpoint],
    ["AZURE_OPENAI_API_MODE", cfg.apiMode],
    ["AZURE_OPENAI_API_VERSION", cfg.apiVersion],
    ["AZURE_OPENAI_AGENT_DEPLOYMENT", cfg.agent],
    ["AZURE_OPENAI_JUDGE_DEPLOYMENT", cfg.judge],
    ["AZURE_OPENAI_SUGGESTER_DEPLOYMENT", cfg.suggester],
  ];
  if (includeSecret && cfg.apiKey) {
    pairs.splice(
      3,
      0,
      [cfg.provider === "foundry" ? "AZURE_FOUNDRY_API_KEY" : "AZURE_OPENAI_API_KEY", cfg.apiKey],
    );
  }
  const prefix = convexEnvPrefix();
  return pairs.map(([key, val]) => [...prefix, "set", key, val]);
}

function printConvex(cfg) {
  for (const cmd of convexCommands(cfg, Boolean(cfg.apiKey))) {
    console.log(cmd.map((part, i) => (i < 5 ? part : q(part))).join(" "));
  }
  if (!cfg.apiKey) {
    const prefix = convexEnvPrefix().join(" ");
    const key = cfg.provider === "foundry" ? "AZURE_FOUNDRY_API_KEY" : "AZURE_OPENAI_API_KEY";
    console.log(
      cfg.provider === "foundry"
        ? `# AZURE_FOUNDRY_API_KEY not found locally. Run: ${prefix} set ${key} '<key>'`
        : `# AZURE_OPENAI_API_KEY not found locally. Run: ${prefix} set ${key} '<key>'`,
    );
  }
}

function run(cmd) {
  console.log(`$ ${cmd.map((part) => q(part)).join(" ")}`);
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    throw new Error(`${cmd[0]} exited with ${result.status}`);
  }
}

function printAll(cfg) {
  console.log("# .env.local / hosted app env");
  console.log(envLines(cfg, Boolean(cfg.apiKey)).join("\n"));
  console.log("\n# Convex env");
  printConvex(cfg);
  console.log("\n# OpenAI-compatible coding tools");
  console.log(`OPENAI_BASE_URL=${cfg.endpoint}/openai/v1`);
  console.log(
    `OPENAI_API_KEY=${cfg.apiKey ? (cfg.provider === "foundry" ? "$AZURE_FOUNDRY_API_KEY" : "$AZURE_OPENAI_API_KEY") : cfg.provider === "foundry" ? "<AZURE_FOUNDRY_API_KEY>" : "<AZURE_OPENAI_API_KEY>"}`,
  );
  console.log(`OPENAI_MODEL=${cfg.agent}`);
  console.log("OPENAI_API_KEY_HEADER=api-key");
  console.log("\n# Standalone A2A worker");
  if (cfg.provider === "foundry") {
    console.log("# a2a-worker currently supports Azure OpenAI for the GPT-5 agent path; use --provider azure-openai for worker env.");
  } else {
    console.log(`ARBOR_MODEL_PROVIDER=azure-openai`);
    console.log(`AZURE_OPENAI_ENDPOINT=${cfg.endpoint}`);
    console.log(`AZURE_OPENAI_API_MODE=${cfg.apiMode}`);
    console.log(`AZURE_OPENAI_AGENT_DEPLOYMENT=${cfg.agent}`);
  }
}

function devtoolApiKey(cfg, materializeSecret = false) {
  if (materializeSecret && cfg.apiKey) return cfg.apiKey;
  if (cfg.apiKey) {
    return cfg.provider === "foundry" ? "$AZURE_FOUNDRY_API_KEY" : "$AZURE_OPENAI_API_KEY";
  }
  return cfg.provider === "foundry" ? "<AZURE_FOUNDRY_API_KEY>" : "<AZURE_OPENAI_API_KEY>";
}

function devtoolEnvVar(cfg) {
  return cfg.provider === "foundry" ? "AZURE_FOUNDRY_API_KEY" : "AZURE_OPENAI_API_KEY";
}

function formatDevtools(cfg) {
  const format = arg("format", "shell");
  const materializeSecret = process.argv.includes("--materialize-secret");
  const baseURL = `${cfg.endpoint}/openai/v1`;
  if (format === "json") {
    return jsonString({
      provider: cfg.provider,
      OPENAI_BASE_URL: baseURL,
      OPENAI_API_KEY: materializeSecret ? cfg.apiKey || "" : undefined,
      OPENAI_API_KEY_ENV: devtoolEnvVar(cfg),
      OPENAI_MODEL: cfg.agent,
      OPENAI_API_KEY_HEADER: "api-key",
    });
  }
  if (format === "dotenv") {
    return [
      `OPENAI_BASE_URL=${baseURL}`,
      `OPENAI_API_KEY=${devtoolApiKey(cfg, materializeSecret)}`,
      `OPENAI_MODEL=${cfg.agent}`,
      "OPENAI_API_KEY_HEADER=api-key",
    ].join("\n");
  }
  if (format !== "shell") {
    throw new Error(`Unknown devtools format "${format}". Use shell, dotenv, or json.`);
  }
  const apiKey =
    cfg.apiKey && !materializeSecret
      ? `"$${devtoolEnvVar(cfg)}"`
      : q(devtoolApiKey(cfg, materializeSecret));
  return [
    `export OPENAI_BASE_URL=${q(baseURL)}`,
    `export OPENAI_API_KEY=${apiKey}`,
    `export OPENAI_MODEL=${q(cfg.agent)}`,
    "export OPENAI_API_KEY_HEADER=api-key",
  ].join("\n");
}

async function writeOrPrint(text) {
  const output = arg("output", "");
  if (!output) {
    console.log(text);
    return;
  }
  await writeFile(output, `${text}\n`);
  console.log(`wrote ${output}`);
}

async function main() {
  await loadEnvLocal();
  const command = process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : "print";
  if (command === "--help" || command === "-h" || command === "help") {
    usage();
    return;
  }
  const cfg = buildConfig();

  if (command === "print") {
    printAll(cfg);
  } else if (command === "convex") {
    if (process.argv.includes("--apply")) {
      if (!cfg.apiKey) {
        throw new Error(
          cfg.provider === "foundry"
            ? "AZURE_FOUNDRY_API_KEY is required for `convex --apply` so Convex can call Foundry."
            : "AZURE_OPENAI_API_KEY is required for `convex --apply` so Convex can call Azure OpenAI.",
        );
      }
      for (const cmd of convexCommands(cfg, true)) run(cmd);
    } else {
      printConvex(cfg);
    }
  } else if (command === "devtools") {
    await writeOrPrint(formatDevtools(cfg));
  } else {
    throw new Error(`Unknown command "${command}"`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
