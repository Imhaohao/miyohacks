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

const APPLY = process.argv.includes("--apply");

function usage() {
  console.log(`Usage:
  npm run azure:bootstrap
  npm run azure:bootstrap -- --apply
  npm run azure:bootstrap -- --apply --set-convex --budget-email you@example.com

Options:
  --resource-group <name>       Default: AZURE_RESOURCE_GROUP or arbor-ai-rg
  --location <region>           Default: AZURE_LOCATION or northcentralus
  --name-prefix <prefix>        Default: AZURE_NAME_PREFIX or arbor
  --budget-email <email>        Required for budget deployment unless --skip-budget
  --budget-name <name>          Default: arbor-azure-credits-guardrail
  --monthly-budget <amount>     Default: 9500
  --credits-total <amount>      Default: 10000, used to catch unsafe budget values
  --budget-start <iso-date>     Default: 2026-06-01T00:00:00Z
  --budget-end <iso-date>       Default: 2027-06-01T00:00:00Z
  --set-convex                  After deployment, set Convex env to Azure OpenAI
  --skip-budget                 Skip subscription budget deployment

Dry-run is the default. Add --apply to create Azure resources or mutate Convex env.
`);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function q(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function convexEnvPrefix() {
  const deployment = process.env.CONVEX_DEPLOYMENT?.trim();
  return deployment
    ? ["npx", "convex", "env", "--deployment", deployment]
    : ["npx", "convex", "env"];
}

function run(args, opts = {}) {
  console.log(`$ ${args.map(q).join(" ")}`);
  if (!APPLY && !opts.force) return { stdout: "", stderr: "", status: 0 };
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  if (result.error) {
    throw new Error(`${args[0]} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `${args[0]} exited with ${result.status}`);
  }
  return result;
}

function requireAzWhenApplying() {
  if (!APPLY) return;
  const result = spawnSync("az", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error("Azure CLI is required for --apply. Install `az` first.");
  }
}

function deploymentParams(cfg) {
  return [
    `namePrefix=${cfg.namePrefix}`,
    `location=${cfg.location}`,
    "deployEnabled=true",
    "deployModelDeployments=true",
    "agentDeploymentName=gpt5-agent",
    "judgeBaseDeploymentName=arbor-judge-base",
    "suggesterBaseDeploymentName=arbor-suggester-base",
  ];
}

function parseOutputs(raw) {
  const parsed = JSON.parse(raw || "{}");
  const out = {};
  for (const [key, value] of Object.entries(parsed)) {
    out[key] = value && typeof value === "object" && "value" in value
      ? value.value
      : value;
  }
  return out;
}

function setConvexEnv(outputs, cfg, azureKey) {
  const endpoint =
    outputs.azureOpenAIEndpoint || process.env.AZURE_OPENAI_ENDPOINT || "";
  if (!endpoint) throw new Error("Missing Azure OpenAI endpoint from deployment");
  if (!azureKey) throw new Error("Missing Azure OpenAI API key for Convex env");

  const pairs = [
    ["ARBOR_MODEL_PROVIDER", "azure-openai"],
    ["ARBOR_AZURE_ENABLED", "true"],
    ["ARBOR_REQUIRE_AZURE", "true"],
    ["ARBOR_MODEL_SPEND_DISABLED", "false"],
    ["AZURE_OPENAI_ENDPOINT", endpoint],
    ["AZURE_OPENAI_API_KEY", azureKey],
    ["AZURE_OPENAI_API_MODE", "responses"],
    ["AZURE_OPENAI_API_VERSION", "2024-10-21"],
    ["AZURE_OPENAI_AGENT_DEPLOYMENT", "gpt5-agent"],
    ["AZURE_OPENAI_JUDGE_DEPLOYMENT", cfg.judgeDeployment],
    ["AZURE_OPENAI_SUGGESTER_DEPLOYMENT", cfg.suggesterDeployment],
  ];
  const prefix = convexEnvPrefix();
  for (const [key, value] of pairs) {
    run([...prefix, "set", key, value]);
  }
}

async function main() {
  await loadEnvLocal();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const cfg = {
    resourceGroup: arg("resource-group", process.env.AZURE_RESOURCE_GROUP || "arbor-ai-rg"),
    location: arg("location", process.env.AZURE_LOCATION || "northcentralus"),
    namePrefix: arg("name-prefix", process.env.AZURE_NAME_PREFIX || "arbor"),
    budgetEmail: arg("budget-email", process.env.AZURE_BUDGET_EMAIL || ""),
    budgetName: arg("budget-name", process.env.AZURE_BUDGET_NAME || "arbor-azure-credits-guardrail"),
    monthlyBudget: arg("monthly-budget", process.env.AZURE_MONTHLY_BUDGET || "9500"),
    creditsTotal: arg("credits-total", process.env.AZURE_CREDITS_TOTAL || "10000"),
    budgetStart: arg("budget-start", process.env.AZURE_BUDGET_START || "2026-06-01T00:00:00Z"),
    budgetEnd: arg("budget-end", process.env.AZURE_BUDGET_END || "2027-06-01T00:00:00Z"),
    judgeDeployment: arg("judge-deployment", "arbor-judge-base"),
    suggesterDeployment: arg("suggester-deployment", "arbor-suggester-base"),
  };

  const skipBudget = process.argv.includes("--skip-budget");
  const setConvex = process.argv.includes("--set-convex");

  if (!APPLY) console.log("# dry run only; add --apply to execute");
  if (Number(cfg.monthlyBudget) > Number(cfg.creditsTotal)) {
    throw new Error(
      `AZURE_MONTHLY_BUDGET (${cfg.monthlyBudget}) must stay at or below AZURE_CREDITS_TOTAL (${cfg.creditsTotal}).`,
    );
  }
  requireAzWhenApplying();

  run(["az", "group", "create", "--name", cfg.resourceGroup, "--location", cfg.location]);

  const deployArgs = [
    "az",
    "deployment",
    "group",
    "create",
    "--resource-group",
    cfg.resourceGroup,
    "--template-file",
    "infra/azure/main.bicep",
    "--parameters",
    ...deploymentParams(cfg),
  ];
  if (APPLY) {
    deployArgs.push("--query", "properties.outputs", "-o", "json");
  }
  const deployment = run(deployArgs, { capture: APPLY });
  const outputs = APPLY ? parseOutputs(deployment.stdout) : {};

  if (!skipBudget) {
    if (!cfg.budgetEmail) {
      console.log("# skipped budget deployment; pass --budget-email or set AZURE_BUDGET_EMAIL");
    } else {
      run([
        "az",
        "deployment",
        "sub",
        "create",
        "--location",
        "eastus",
        "--template-file",
        "infra/azure/budget.bicep",
        "--parameters",
        `budgetName=${cfg.budgetName}`,
        `alertEmail=${cfg.budgetEmail}`,
        `monthlyAmount=${cfg.monthlyBudget}`,
        `startDate=${cfg.budgetStart}`,
        `endDate=${cfg.budgetEnd}`,
      ]);
    }
  }

  let azureKey = process.env.AZURE_OPENAI_API_KEY || "";
  if (APPLY && setConvex) {
    const accountName =
      outputs.azureOpenAIAccountName ||
      process.env.AZURE_OPENAI_RESOURCE_NAME ||
      "";
    if (!azureKey) {
      if (!accountName) {
        throw new Error("Cannot fetch Azure OpenAI key without account name");
      }
      const keyResult = run(
        [
          "az",
          "cognitiveservices",
          "account",
          "keys",
          "list",
          "--resource-group",
          cfg.resourceGroup,
          "--name",
          accountName,
          "--query",
          "key1",
          "-o",
          "tsv",
        ],
        { capture: true },
      );
      azureKey = keyResult.stdout.trim();
    }
    setConvexEnv(outputs, cfg, azureKey);
  }

  const endpoint =
    outputs.azureOpenAIEndpoint ||
    "https://<created-resource>.openai.azure.com";
  console.log("\n# Next steps");
  console.log(`AZURE_RESOURCE_GROUP=${cfg.resourceGroup}`);
  console.log(`AZURE_OPENAI_ENDPOINT=${endpoint}`);
  console.log("AZURE_OPENAI_AGENT_DEPLOYMENT=gpt5-agent");
  console.log(`AZURE_OPENAI_JUDGE_DEPLOYMENT=${cfg.judgeDeployment}`);
  console.log(`AZURE_OPENAI_SUGGESTER_DEPLOYMENT=${cfg.suggesterDeployment}`);
  console.log(`AZURE_BUDGET_NAME=${cfg.budgetName}`);
  console.log(`AZURE_CREDITS_TOTAL=${cfg.creditsTotal}`);
  console.log("ARBOR_REQUIRE_AZURE=true");
  console.log("ARBOR_MODEL_SPEND_DISABLED=false");
  console.log("npm run azure:ready -- --smoke");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
