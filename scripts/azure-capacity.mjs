#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
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
  npm run azure:capacity
  npm run azure:capacity -- --location northcentralus
  npm run azure:capacity -- --agent-model gpt-5 --agent-version 2025-08-07

Checks Azure OpenAI model availability, SKU support, and quota for the Arbor
agent, judge, and suggester deployment targets. Requires Azure CLI auth.
`);
}

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function env(name, fallback = "") {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function run(args) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    cwd: process.cwd(),
  });
  if (result.error) {
    return { ok: false, stdout: "", stderr: result.error.message };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function commandExists(name) {
  const result = run(["sh", "-lc", `command -v ${name}`]);
  return result.ok ? result.stdout : "";
}

function parseJson(result, label) {
  if (!result.ok) {
    record(label, false, result.stderr);
    return null;
  }
  try {
    return JSON.parse(result.stdout || "[]");
  } catch {
    record(label, false, result.stdout || "invalid JSON");
    return null;
  }
}

function modelName(item) {
  return item?.model?.name ?? item?.name ?? item?.modelName ?? "";
}

function modelVersion(item) {
  return item?.model?.version ?? item?.version ?? item?.modelVersion ?? "";
}

function modelSkus(item) {
  const values = item?.model?.skus ?? item?.skus ?? item?.sku ?? [];
  return (Array.isArray(values) ? values : [values])
    .map((sku) => (typeof sku === "string" ? sku : sku?.name ?? sku?.skuName ?? ""))
    .filter(Boolean);
}

function findModel(models, target) {
  const lowerName = target.model.toLowerCase();
  const candidates = models.filter((item) => modelName(item).toLowerCase() === lowerName);
  if (!target.version) return candidates[0] ?? null;
  return (
    candidates.find((item) => modelVersion(item) === target.version) ??
    candidates.find((item) => !modelVersion(item)) ??
    null
  );
}

function usageLabel(item) {
  const name = item?.name;
  if (typeof name === "string") return name;
  return name?.value ?? name?.localizedValue ?? item?.currentValueName ?? "";
}

function findUsage(usages, target) {
  const sku = target.sku.toLowerCase();
  const model = target.model.toLowerCase();
  return usages.find((item) => {
    const label = usageLabel(item).toLowerCase();
    return label.includes(sku) && label.includes(model);
  });
}

function usageAvailable(item) {
  const limit = Number(item?.limit ?? item?.quota ?? item?.maxValue);
  const current = Number(item?.currentValue ?? item?.current ?? 0);
  if (!Number.isFinite(limit)) return null;
  return {
    limit,
    current: Number.isFinite(current) ? current : 0,
    available: limit - (Number.isFinite(current) ? current : 0),
  };
}

function targets() {
  const baseJudgeModel = arg("judge-model", env("AZURE_OPENAI_JUDGE_BASE_MODEL", "gpt-4.1-mini"));
  const baseSuggesterModel = arg(
    "suggester-model",
    env("AZURE_OPENAI_SUGGESTER_BASE_MODEL", "gpt-4.1-mini"),
  );
  return [
    {
      role: "agent",
      model: arg("agent-model", env("AZURE_OPENAI_AGENT_BASE_MODEL", "gpt-5")),
      version: arg("agent-version", env("AZURE_OPENAI_AGENT_MODEL_VERSION", "2025-08-07")),
      sku: arg("agent-sku", env("AZURE_OPENAI_AGENT_SKU", "GlobalStandard")),
      deployment: env("AZURE_OPENAI_AGENT_DEPLOYMENT", "gpt5-agent"),
    },
    {
      role: "judge-base",
      model: baseJudgeModel,
      version: arg("judge-version", env("AZURE_OPENAI_JUDGE_BASE_MODEL_VERSION", "2025-04-14")),
      sku: arg("judge-sku", env("AZURE_OPENAI_JUDGE_SKU", "GlobalStandard")),
      deployment: env("AZURE_OPENAI_JUDGE_DEPLOYMENT", "arbor-judge-base"),
    },
    {
      role: "suggester-base",
      model: baseSuggesterModel,
      version: arg(
        "suggester-version",
        env("AZURE_OPENAI_SUGGESTER_BASE_MODEL_VERSION", "2025-04-14"),
      ),
      sku: arg("suggester-sku", env("AZURE_OPENAI_SUGGESTER_SKU", "GlobalStandard")),
      deployment: env("AZURE_OPENAI_SUGGESTER_DEPLOYMENT", "arbor-suggester-base"),
    },
  ];
}

async function main() {
  await loadEnvLocal();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const az = commandExists("az");
  record("Azure CLI", Boolean(az), az || "not installed");
  if (!az) process.exit(1);

  const subscription =
    arg("subscription", env("AZURE_SUBSCRIPTION_ID")) ||
    run(["az", "account", "show", "--query", "id", "-o", "tsv"]).stdout;
  record("Azure subscription", Boolean(subscription), subscription || "missing");

  const location = arg("location", env("AZURE_LOCATION", "northcentralus"));
  record("Azure location", Boolean(location), location);
  if (!subscription || !location) process.exit(1);

  const models = parseJson(
    run([
      "az",
      "cognitiveservices",
      "model",
      "list",
      "--location",
      location,
      "--subscription",
      subscription,
      "-o",
      "json",
    ]),
    "model catalog",
  );
  const usages = parseJson(
    run([
      "az",
      "cognitiveservices",
      "usage",
      "list",
      "--location",
      location,
      "--subscription",
      subscription,
      "-o",
      "json",
    ]),
    "quota usage",
  );
  if (!Array.isArray(models) || !Array.isArray(usages)) process.exit(1);

  for (const target of targets()) {
    const model = findModel(models, target);
    record(
      `${target.role} model available`,
      Boolean(model),
      model
        ? `${target.model}${modelVersion(model) ? ` ${modelVersion(model)}` : ""}`
        : `${target.model} ${target.version}`,
    );
    const skus = model ? modelSkus(model) : [];
    record(
      `${target.role} SKU supported`,
      skus.includes(target.sku),
      skus.length ? skus.join(", ") : `missing ${target.sku}`,
    );
    const usage = findUsage(usages, target);
    const capacity = usage ? usageAvailable(usage) : null;
    record(
      `${target.role} quota available`,
      Boolean(capacity && capacity.available > 0),
      capacity
        ? `${capacity.available} available (${capacity.current}/${capacity.limit} used) for ${target.deployment}`
        : `could not find usage row for ${target.sku}/${target.model}`,
    );
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} capacity checks passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
