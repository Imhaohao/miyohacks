#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
      process.env[key] =
        process.env[key]?.trim().replace(/\s+#.*$/, "").trim() || value;
    }
  } catch {
    // Optional.
  }
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function env(name) {
  const value = process.env[name]?.trim();
  return value ? value : "";
}

function commandExists(name) {
  const result = spawnSync("sh", ["-lc", `command -v ${name}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function run(args) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    cwd: process.cwd(),
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function jsonlCount(path) {
  try {
    let raw = readFileSync(path, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return raw.trim().split(/\n/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function appliedManifest() {
  const path = "data/fine-tuning/azure-finetune-manifest.json";
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function status() {
  const az = commandExists("az");
  const vercel = commandExists("vercel") || commandExists("npx");
  const manifest = appliedManifest();
  const azAccount = az ? run(["az", "account", "show", "--query", "id", "-o", "tsv"]) : null;
  return {
    repo_ready_files: [
      "lib/openai.ts",
      "infra/azure/main.bicep",
      "infra/azure/budget.bicep",
      "scripts/azure-bootstrap.mjs",
      "scripts/azure-capacity.mjs",
      "scripts/azure-env.mjs",
      "scripts/azure-local-env.mjs",
      "scripts/azure-vercel-env.mjs",
      "scripts/azure-prereqs.mjs",
      "scripts/azure-off.mjs",
      "scripts/azure-finetune-pipeline.mjs",
      "scripts/validate-finetune-data.ts",
      "scripts/evaluate-finetune-model.ts",
    ].every((path) => existsSync(path)),
    fine_tune_examples: {
      suggester_train: jsonlCount("data/fine-tuning/arbor-suggester.train.jsonl"),
      suggester_validation: jsonlCount("data/fine-tuning/arbor-suggester.validation.jsonl"),
      suggester_test: jsonlCount("data/fine-tuning/arbor-suggester.test.jsonl"),
      judge_train: jsonlCount("data/fine-tuning/arbor-judge.train.jsonl"),
      judge_validation: jsonlCount("data/fine-tuning/arbor-judge.validation.jsonl"),
      judge_test: jsonlCount("data/fine-tuning/arbor-judge.test.jsonl"),
    },
    provider: env("ARBOR_MODEL_PROVIDER") || "openai",
    require_azure: env("ARBOR_REQUIRE_AZURE") || "(missing)",
    spend_disabled: env("ARBOR_MODEL_SPEND_DISABLED") || "false",
    azure_cli: Boolean(az),
    azure_login: Boolean(azAccount?.ok && azAccount.stdout),
    azure_subscription: azAccount?.stdout || env("AZURE_SUBSCRIPTION_ID") || "(missing)",
    azure_resource_group: env("AZURE_RESOURCE_GROUP") || "(missing)",
    azure_openai_endpoint: env("AZURE_OPENAI_ENDPOINT") || "(missing)",
    budget_name: env("AZURE_BUDGET_NAME") || "arbor-azure-credits-guardrail",
    credits_total: env("AZURE_CREDITS_TOTAL") || "10000",
    vercel_cli_available: Boolean(vercel),
    applied_fine_tune_manifest: Boolean(manifest?.apply === true),
    fine_tuned_judge_deployed: Boolean(manifest?.roles?.judge?.deployed_model),
    fine_tuned_suggester_deployed: Boolean(manifest?.roles?.suggester?.deployed_model),
  };
}

function steps() {
  const email = env("AZURE_BUDGET_EMAIL") || "you@example.com";
  return [
    {
      phase: "0. Local repo proof",
      intent: "Prove the repo has every script, IaC file, dataset, and verifier before touching Azure.",
      commands: [
        "npm run azure:ready -- --repo-only",
        "npm run ft:data && npm run ft:validate && npm run ft:eval",
      ],
      evidence: "Repo-only readiness passes and validation/eval reports are generated locally.",
    },
    {
      phase: "1. Azure auth and quota",
      intent: "Confirm the subscription can deploy the GPT-5 agent and judge/suggester base models.",
      commands: [
        "npm run azure:prereqs",
        "az login",
        "az account set --subscription <subscription-id>",
        "export AZURE_SUBSCRIPTION_ID=<subscription-id>",
        "export AZURE_RESOURCE_GROUP=arbor-ai-rg",
        "export AZURE_LOCATION=northcentralus",
        "npm run azure:prereqs -- --register-providers --apply",
        "npm run azure:capacity",
      ],
      evidence: "Prerequisite and capacity preflights pass for local tooling, Azure auth, resource providers, model availability, SKU support, and quota.",
    },
    {
      phase: "2. Provision Azure credits infrastructure",
      intent: "Create Azure OpenAI, GPT-5 agent deployment, base judge/suggester deployments, storage/search/logging, and the $10k budget guardrail.",
      commands: [
        `npm run azure:bootstrap -- --apply --set-convex --budget-email ${email}`,
        "npm run azure:ready",
      ],
      evidence: "Azure OpenAI account exists, budget <= credits total exists, Convex points at Azure, and base deployments exist.",
    },
    {
      phase: "3. Wire local, hosted, and coding-tool development",
      intent: "Make local Arbor, Convex, Vercel, and OpenAI-compatible coding tools use Azure/Foundry instead of direct OpenAI.",
      commands: [
        "npm run azure:local -- azure-openai --apply",
        "npm run azure:env -- convex --apply",
        "npm run azure:vercel -- azure-openai --apply --materialize-secret",
        "npm run azure:env -- devtools --format dotenv --output .env.azure-devtools --materialize-secret",
        "npm run model:smoke -- agent",
        "npm run azure:devtools:smoke -- --env-file .env.azure-devtools",
      ],
      evidence: "Agent smoke and devtools smoke both call the Azure GPT-5 deployment successfully.",
    },
    {
      phase: "4. Fine-tune judge and suggester",
      intent: "Submit validated SFT data, monitor jobs, deploy completed fine-tuned models, and switch Arbor judge/suggester traffic to them.",
      commands: [
        "npm run azure:ft:pipeline -- start --apply",
        "npm run azure:ft:pipeline -- status",
        "npm run azure:ft:pipeline -- deploy --apply",
        "AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester npm run azure:env -- convex --apply",
        "AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester npm run azure:vercel -- azure-openai --apply --materialize-secret",
        "npm run ft:eval -- judge --live --output data/fine-tuning/eval-report.judge-live.json",
        "npm run ft:eval -- suggester --live --output data/fine-tuning/eval-report.suggester-live.json",
      ],
      evidence: "Applied manifest records successful jobs/deployments, live held-out evals run, and runtime env selects arbor-judge/arbor-suggester.",
    },
    {
      phase: "5. Final readiness",
      intent: "Prove the requested end state: Azure GPT-5 agent, fine-tuned judge/suggester, budget guardrail, and model smoke tests.",
      commands: ["npm run azure:ready -- --smoke"],
      evidence: "Full readiness passes, including paid model smoke tests.",
    },
    {
      phase: "6. Instant off",
      intent: "Stop model spend immediately across local, Convex, hosted Vercel, and optional Azure app hosting. Use the hard-off command when you also want to delete the Arbor Azure resource group and stop non-token Azure service charges.",
      commands: [
        "npm run azure:local -- off --apply",
        "npm run azure:off -- --apply --vercel",
        "npm run azure:off -- --verify",
        "npm run azure:off -- --delete-resource-group --resource-group arbor-ai-rg",
        "npm run azure:off -- --apply --delete-resource-group --resource-group arbor-ai-rg --confirm-resource-group arbor-ai-rg",
      ],
      evidence: "Off verifier passes; Arbor model provider is disabled and spend switch is true. For hard-off, Azure reports the Arbor resource group no longer exists.",
    },
  ];
}

function markdown(report) {
  const lines = ["# Arbor Azure Activation Runbook", ""];
  lines.push("## Current Evidence", "");
  for (const [key, value] of Object.entries(report.status)) {
    lines.push(`- ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
  }
  lines.push("", "## Ordered Steps", "");
  for (const step of report.steps) {
    lines.push(`### ${step.phase}`, "");
    lines.push(step.intent, "");
    lines.push("```bash");
    for (const command of step.commands) lines.push(command);
    lines.push("```", "");
    lines.push(`Evidence: ${step.evidence}`, "");
  }
  return lines.join("\n");
}

async function main() {
  await loadEnvLocal();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: npm run azure:runbook [-- --format markdown|json]");
    return;
  }
  const report = {
    generated_at: new Date().toISOString(),
    status: status(),
    steps: steps(),
  };
  if (arg("format", "markdown") === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(markdown(report));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
