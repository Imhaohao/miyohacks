#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

const WANT_SMOKE = process.argv.includes("--smoke");
const REPO_ONLY = process.argv.includes("--repo-only");
const DEFAULT_BUDGET_NAME = "arbor-azure-credits-guardrail";
const DEFAULT_CREDITS_TOTAL = 10000;
const FINE_TUNE_SUCCESS_STATUSES = new Set(["succeeded", "completed"]);

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

function commandExists(name) {
  const result = spawnSync("sh", ["-lc", `command -v ${name}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function run(args, opts = {}) {
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

function env(name) {
  const value = process.env[name]?.trim();
  return value ? value : "";
}

function num(name, fallback) {
  const raw = env(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function redact(value) {
  if (!value) return "(missing)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function checkFile(path) {
  const result = run(["test", "-f", path]);
  record(`file ${path}`, result.ok, result.ok ? "present" : "missing");
}

function checkJsonl(path) {
  try {
    let raw = readFileSync(path, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const lines = raw.trim().split(/\n/).filter(Boolean);
    for (const line of lines) JSON.parse(line);
    record(`jsonl ${path}`, true, `${lines.length} examples`);
  } catch (err) {
    record(`jsonl ${path}`, false, err instanceof Error ? err.message : String(err));
  }
}

function checkFineTuneManifest(repoOnly = false) {
  const manifestPath = "data/fine-tuning/azure-finetune-manifest.json";
  const examplePath = "data/fine-tuning/azure-finetune-manifest.example.json";
  const hasAppliedManifest = readFileMaybe(manifestPath);
  const path = hasAppliedManifest ? manifestPath : examplePath;
  try {
    const raw = readFileSync(path, "utf8");
    const manifest = JSON.parse(raw);
    const roles = manifest.roles ?? {};
    const hasJudge = Boolean(roles.judge?.job_id && roles.judge?.deployment);
    const hasSuggester = Boolean(roles.suggester?.job_id && roles.suggester?.deployment);
    if (repoOnly) {
      record(
        "fine-tune pipeline manifest",
        hasJudge && hasSuggester,
        hasAppliedManifest ? manifestPath : "example present",
      );
      return manifest;
    }

    const ok =
      hasAppliedManifest &&
      manifest.apply === true &&
      hasJudge &&
      hasSuggester &&
      !String(roles.judge.job_id).startsWith("dryrun:") &&
      !String(roles.suggester.job_id).startsWith("dryrun:");
    record(
      "fine-tune pipeline manifest",
      ok,
      ok ? path : "run npm run azure:ft:pipeline -- start --apply",
    );
    if (ok) {
      for (const role of ["judge", "suggester"]) {
        const entry = roles[role] ?? {};
        const status = String(entry.job_status ?? "").toLowerCase();
        record(
          `fine-tune ${role} job`,
          FINE_TUNE_SUCCESS_STATUSES.has(status),
          entry.job_status || "missing status; run npm run azure:ft:pipeline -- status",
        );
        record(
          `fine-tune ${role} deploy recorded`,
          Boolean(entry.deployed_model && entry.deployed_at),
          entry.deployed_model || "run npm run azure:ft:pipeline -- deploy --apply",
        );
      }
    }
    return manifest;
  } catch (err) {
    record(
      "fine-tune pipeline manifest",
      false,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function readFileMaybe(path) {
  try {
    readFileSync(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

function checkEnv() {
  const provider = env("ARBOR_MODEL_PROVIDER") || "openai";
  record("model provider configured", provider !== "openai", provider);
  record(
    "require Azure guard",
    env("ARBOR_REQUIRE_AZURE") === "true",
    env("ARBOR_REQUIRE_AZURE") || "missing",
  );
  record(
    "model spend enabled",
    env("ARBOR_MODEL_SPEND_DISABLED") !== "true",
    env("ARBOR_MODEL_SPEND_DISABLED") || "false",
  );
  if (provider === "azure-openai") {
    record("AZURE_OPENAI_ENDPOINT", Boolean(env("AZURE_OPENAI_ENDPOINT")), env("AZURE_OPENAI_ENDPOINT") || "missing");
    record("AZURE_OPENAI_API_KEY", Boolean(env("AZURE_OPENAI_API_KEY")), redact(env("AZURE_OPENAI_API_KEY")));
    record("GPT-5 agent deployment", Boolean(env("AZURE_OPENAI_AGENT_DEPLOYMENT")), env("AZURE_OPENAI_AGENT_DEPLOYMENT") || "missing");
    record("judge deployment", Boolean(env("AZURE_OPENAI_JUDGE_DEPLOYMENT")), env("AZURE_OPENAI_JUDGE_DEPLOYMENT") || "missing");
    record("suggester deployment", Boolean(env("AZURE_OPENAI_SUGGESTER_DEPLOYMENT")), env("AZURE_OPENAI_SUGGESTER_DEPLOYMENT") || "missing");
  } else if (provider === "foundry") {
    record("AZURE_FOUNDRY_ENDPOINT", Boolean(env("AZURE_FOUNDRY_ENDPOINT") || env("AZURE_AI_FOUNDRY_ENDPOINT")), env("AZURE_FOUNDRY_ENDPOINT") || env("AZURE_AI_FOUNDRY_ENDPOINT") || "missing");
    record("AZURE_FOUNDRY_API_KEY", Boolean(env("AZURE_FOUNDRY_API_KEY") || env("AZURE_INFERENCE_CREDENTIAL")), redact(env("AZURE_FOUNDRY_API_KEY") || env("AZURE_INFERENCE_CREDENTIAL")));
  }
}

function checkAz() {
  const az = commandExists("az");
  record("Azure CLI", Boolean(az), az || "not installed");
  if (!az) return;
  const acct = run(["az", "account", "show", "--query", "id", "-o", "tsv"]);
  record("Azure login", acct.ok && Boolean(acct.stdout), acct.ok ? acct.stdout : acct.stderr);
}

function openAIAccountName() {
  const explicit = env("AZURE_OPENAI_RESOURCE_NAME");
  if (explicit) return explicit;
  const match = env("AZURE_OPENAI_ENDPOINT").match(/^https:\/\/([^.]+)\.openai\.azure\.com/i);
  return match?.[1] ?? "";
}

function subscriptionId() {
  if (env("AZURE_SUBSCRIPTION_ID")) return env("AZURE_SUBSCRIPTION_ID");
  if (!commandExists("az")) return "";
  const acct = run(["az", "account", "show", "--query", "id", "-o", "tsv"]);
  return acct.ok ? acct.stdout : "";
}

function checkDeployment(label, dep, rg, account) {
  if (!dep) {
    record(label, false, "missing env");
    return { ok: false, model: "" };
  }
  const found = run([
    "az",
    "cognitiveservices",
    "account",
    "deployment",
    "show",
    "--resource-group",
    rg,
    "--name",
    account,
    "--deployment-name",
    dep,
    "--query",
    "properties.model.name",
    "-o",
    "tsv",
  ]);
  record(label, found.ok, found.ok ? `${dep}${found.stdout ? ` (${found.stdout})` : ""}` : found.stderr);
  return { ok: found.ok, model: found.stdout };
}

function checkAzureResources() {
  if (!commandExists("az")) return;
  const rg = env("AZURE_RESOURCE_GROUP");
  const account = openAIAccountName();
  if (!rg || !account) {
    record("Azure OpenAI account lookup", false, "set AZURE_RESOURCE_GROUP and AZURE_OPENAI_RESOURCE_NAME");
    return;
  }
  const show = run([
    "az",
    "cognitiveservices",
    "account",
    "show",
    "--resource-group",
    rg,
    "--name",
    account,
    "--query",
    "properties.endpoint",
    "-o",
    "tsv",
  ]);
  record("Azure OpenAI account", show.ok, show.ok ? show.stdout : show.stderr);

  const agent = checkDeployment(
    "GPT-5 agent deployment",
    env("AZURE_OPENAI_AGENT_DEPLOYMENT"),
    rg,
    account,
  );
  record(
    "GPT-5 agent model",
    agent.ok && /gpt-?5/i.test(agent.model),
    agent.model || "missing model name",
  );
  checkDeployment("judge deployment", env("AZURE_OPENAI_JUDGE_DEPLOYMENT"), rg, account);
  checkDeployment(
    "suggester deployment",
    env("AZURE_OPENAI_SUGGESTER_DEPLOYMENT"),
    rg,
    account,
  );
}

function checkBudgetGuardrail() {
  if (!commandExists("az")) return;
  const sub = subscriptionId();
  if (!sub) {
    record("Azure budget guardrail", false, "set AZURE_SUBSCRIPTION_ID or run az login");
    return;
  }
  const budgetName = env("AZURE_BUDGET_NAME") || DEFAULT_BUDGET_NAME;
  const creditsTotal = num("AZURE_CREDITS_TOTAL", DEFAULT_CREDITS_TOTAL);
  const result = run([
    "az",
    "rest",
    "--method",
    "get",
    "--url",
    `https://management.azure.com/subscriptions/${encodeURIComponent(sub)}/providers/Microsoft.Consumption/budgets/${encodeURIComponent(budgetName)}?api-version=2023-11-01`,
    "--query",
    "properties.amount",
    "-o",
    "tsv",
  ]);
  const amount = Number(result.stdout);
  record(
    "Azure budget guardrail",
    result.ok && Number.isFinite(amount) && amount > 0 && amount <= creditsTotal,
    result.ok ? `${budgetName}: $${amount} <= $${creditsTotal} credits` : result.stderr,
  );
}

function checkFineTunedDeployments(manifest) {
  if (!commandExists("az")) return;
  const rg = env("AZURE_RESOURCE_GROUP");
  const account = openAIAccountName();
  if (!rg || !account) {
    record("fine-tuned deployment lookup", false, "set AZURE_RESOURCE_GROUP and AZURE_OPENAI_RESOURCE_NAME");
    return;
  }
  const roles = manifest?.roles ?? {};
  const expected = {
    judge:
      env("AZURE_OPENAI_JUDGE_FINE_TUNED_DEPLOYMENT") ||
      roles.judge?.deployment ||
      "arbor-judge",
    suggester:
      env("AZURE_OPENAI_SUGGESTER_FINE_TUNED_DEPLOYMENT") ||
      roles.suggester?.deployment ||
      "arbor-suggester",
  };
  for (const role of ["judge", "suggester"]) {
    checkDeployment(`fine-tuned ${role} deployment`, expected[role], rg, account);
    const selected = env(`AZURE_OPENAI_${role.toUpperCase()}_DEPLOYMENT`);
    record(
      `fine-tuned ${role} selected`,
      selected === expected[role],
      selected ? `AZURE_OPENAI_${role.toUpperCase()}_DEPLOYMENT=${selected}` : "runtime env missing",
    );
  }
}

function checkSmoke() {
  if (!WANT_SMOKE) {
    record("paid model smoke tests", true, "skipped; pass --smoke to run");
    return;
  }
  for (const purpose of ["agent", "judge", "suggester"]) {
    const result = run(["npm", "run", "model:smoke", "--", purpose]);
    record(`model smoke ${purpose}`, result.ok, result.ok ? "ok" : result.stderr);
  }
}

async function main() {
  await loadEnvLocal();
  checkFile("lib/openai.ts");
  checkFile("infra/azure/main.bicep");
  checkFile("infra/azure/budget.bicep");
  checkFile("scripts/azure-off.mjs");
  checkFile("scripts/azure-finetune.mjs");
  checkFile("scripts/azure-env.mjs");
  checkFile("scripts/azure-local-env.mjs");
  checkFile("scripts/devtools-smoke.mjs");
  checkFile("scripts/azure-vercel-env.mjs");
  checkFile("scripts/azure-runbook.mjs");
  checkFile("scripts/azure-prereqs.mjs");
  checkFile("scripts/azure-bootstrap.mjs");
  checkFile("scripts/azure-capacity.mjs");
  checkFile("scripts/azure-finetune-pipeline.mjs");
  checkFile("scripts/validate-finetune-data.ts");
  checkFile("scripts/evaluate-finetune-model.ts");
  checkJsonl("data/fine-tuning/arbor-suggester.train.jsonl");
  checkJsonl("data/fine-tuning/arbor-suggester.validation.jsonl");
  checkJsonl("data/fine-tuning/arbor-suggester.test.jsonl");
  checkJsonl("data/fine-tuning/arbor-judge.train.jsonl");
  checkJsonl("data/fine-tuning/arbor-judge.validation.jsonl");
  checkJsonl("data/fine-tuning/arbor-judge.test.jsonl");
  const manifest = checkFineTuneManifest(REPO_ONLY);
  if (REPO_ONLY) {
    record("cloud readiness", true, "skipped by --repo-only");
    const failed = checks.filter((check) => !check.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    if (failed.length > 0) process.exit(1);
    return;
  }
  checkEnv();
  checkAz();
  checkBudgetGuardrail();
  checkAzureResources();
  checkFineTunedDeployments(manifest);
  checkSmoke();

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
