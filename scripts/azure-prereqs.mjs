#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const REGISTER_PROVIDERS = process.argv.includes("--register-providers");
const JSON_OUTPUT = process.argv.includes("--json");

const REQUIRED_PROVIDERS = [
  "Microsoft.CognitiveServices",
  "Microsoft.Search",
  "Microsoft.Storage",
  "Microsoft.OperationalInsights",
  "Microsoft.Consumption",
];

const OPTIONAL_PROVIDERS = [
  {
    namespace: "Microsoft.App",
    reason: "Container Apps worker hosting",
  },
];

const checks = [];

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
  npm run azure:prereqs
  npm run azure:prereqs -- --json
  npm run azure:prereqs -- --register-providers --apply

Checks local and subscription prerequisites before running the Arbor Azure
activation flow. Dry-run is the default.

Options:
  --json                         Print machine-readable JSON.
  --register-providers           Include Azure resource-provider registration commands.
  --apply                        With --register-providers, register missing providers.

This script never installs system tools. Install Azure CLI manually if the
Azure CLI check fails, then run \`az login\` and rerun this preflight.
`);
}

function arg(name, fallback = "") {
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
    return { ok: false, stdout: "", stderr: result.error.message, status: 1 };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    status: result.status ?? 1,
  };
}

function commandExists(name) {
  const result = run(["sh", "-lc", `command -v ${name}`]);
  return result.ok ? result.stdout.trim() : "";
}

function record(name, ok, detail = "", fix = "", required = true) {
  const check = { name, ok: Boolean(ok), detail, fix, required };
  checks.push(check);
  if (!JSON_OUTPUT) {
    const label = ok ? "PASS" : required ? "FAIL" : "WARN";
    console.log(`${label} ${name}${detail ? ` - ${detail}` : ""}`);
    if (!ok && fix) console.log(`  fix: ${fix}`);
  }
  return check.ok;
}

function parseMajor(versionText) {
  const match = String(versionText).match(/v?(\d+)/);
  return match ? Number(match[1]) : 0;
}

function checkLocalTooling() {
  const node = run(["node", "--version"]);
  const nodeMajor = parseMajor(node.stdout);
  record(
    "Node.js",
    node.ok && nodeMajor >= 20,
    node.stdout || node.stderr || "missing",
    "Install Node.js 20+ before running Arbor scripts.",
  );

  const npm = run(["npm", "--version"]);
  record("npm", npm.ok, npm.stdout || npm.stderr || "missing", "Install npm with Node.js.");

  const packageDepsInstalled = existsSync("node_modules/.bin/tsx");
  record(
    "repo dependencies",
    packageDepsInstalled,
    packageDepsInstalled ? "node_modules present" : "node_modules/.bin/tsx missing",
    "Run npm install.",
  );

  const convexReady = existsSync("node_modules/.bin/convex") || Boolean(commandExists("npx"));
  record(
    "Convex CLI path",
    convexReady,
    existsSync("node_modules/.bin/convex") ? "local convex binary" : "npx available",
    "Run npm install so npx convex env can manage hosted Arbor env.",
  );

  const vercelReady = Boolean(commandExists("vercel") || commandExists("npx"));
  record(
    "Vercel CLI path",
    vercelReady,
    commandExists("vercel") || "npx available",
    "Install Vercel CLI or keep npx available for azure:vercel.",
    false,
  );
}

function checkAzureCli() {
  const az = commandExists("az");
  record(
    "Azure CLI",
    Boolean(az),
    az || "not installed",
    "Install Azure CLI, then run az login. macOS with Homebrew: brew install azure-cli",
  );
  if (!az) return { az: false, loggedIn: false, subscription: "" };

  const account = run(["az", "account", "show", "-o", "json"]);
  let subscription = env("AZURE_SUBSCRIPTION_ID");
  if (account.ok) {
    try {
      const parsed = JSON.parse(account.stdout);
      subscription = parsed.id || subscription;
      record(
        "Azure login",
        Boolean(parsed.id),
        parsed.name ? `${parsed.name} (${parsed.id})` : parsed.id || "missing subscription",
        "Run az login and az account set --subscription <subscription-id>.",
      );
    } catch {
      record("Azure login", false, "invalid az account JSON", "Run az login.");
    }
  } else {
    record("Azure login", false, account.stderr || "not logged in", "Run az login.");
  }

  const bicep = run(["az", "bicep", "version"]);
  record(
    "Azure Bicep CLI",
    bicep.ok,
    bicep.stdout || bicep.stderr || "missing",
    "Run az bicep install.",
  );

  return { az: true, loggedIn: account.ok, subscription };
}

function providerState(namespace) {
  return run([
    "az",
    "provider",
    "show",
    "--namespace",
    namespace,
    "--query",
    "registrationState",
    "-o",
    "tsv",
  ]);
}

function registerProvider(namespace) {
  return run(["az", "provider", "register", "--namespace", namespace, "--wait"]);
}

function checkProvider(namespace, required = true, reason = "") {
  let state = providerState(namespace);
  if (
    state.ok &&
    state.stdout !== "Registered" &&
    REGISTER_PROVIDERS &&
    APPLY
  ) {
    if (!JSON_OUTPUT) console.log(`$ az provider register --namespace ${namespace} --wait`);
    const registration = registerProvider(namespace);
    if (!registration.ok) {
      record(
        `provider ${namespace}`,
        false,
        registration.stderr || "registration failed",
        `Run az provider register --namespace ${namespace} --wait`,
        required,
      );
      return;
    }
    state = providerState(namespace);
  }

  const ok = state.ok && state.stdout === "Registered";
  const command = `az provider register --namespace ${namespace} --wait`;
  record(
    `provider ${namespace}`,
    ok,
    state.ok ? state.stdout || "unknown" : state.stderr || "lookup failed",
    REGISTER_PROVIDERS ? command : `${command} or rerun with --register-providers --apply`,
    required,
  );
  if (!ok && reason && !JSON_OUTPUT) console.log(`  used for: ${reason}`);
}

function checkProviders(canQuery) {
  if (!canQuery) {
    for (const namespace of REQUIRED_PROVIDERS) {
      record(
        `provider ${namespace}`,
        false,
        "skipped until Azure login works",
        "Run az login, then rerun npm run azure:prereqs.",
      );
    }
    for (const provider of OPTIONAL_PROVIDERS) {
      record(
        `provider ${provider.namespace}`,
        false,
        "skipped until Azure login works",
        `Run az login, then rerun if using ${provider.reason}.`,
        false,
      );
    }
    return;
  }

  for (const namespace of REQUIRED_PROVIDERS) checkProvider(namespace);
  for (const provider of OPTIONAL_PROVIDERS) {
    checkProvider(provider.namespace, false, provider.reason);
  }
}

function checkActivationConfig() {
  const location = arg("location", env("AZURE_LOCATION", "northcentralus"));
  record("Azure location selected", Boolean(location), location, "Set AZURE_LOCATION.");

  const resourceGroup = arg("resource-group", env("AZURE_RESOURCE_GROUP", "arbor-ai-rg"));
  record(
    "Azure resource group target",
    Boolean(resourceGroup),
    resourceGroup,
    "Set AZURE_RESOURCE_GROUP.",
  );

  const creditsTotal = Number(env("AZURE_CREDITS_TOTAL", "10000"));
  const monthlyBudget = Number(env("AZURE_MONTHLY_BUDGET", "9500"));
  record(
    "credits budget cap",
    Number.isFinite(creditsTotal) &&
      Number.isFinite(monthlyBudget) &&
      monthlyBudget > 0 &&
      monthlyBudget <= creditsTotal,
    `$${monthlyBudget || "?"} monthly <= $${creditsTotal || "?"} credits`,
    "Set AZURE_CREDITS_TOTAL=10000 and AZURE_MONTHLY_BUDGET below that number.",
  );

  const budgetEmail = env("AZURE_BUDGET_EMAIL") || arg("budget-email");
  record(
    "budget alert email",
    Boolean(budgetEmail),
    budgetEmail || "missing",
    "Set AZURE_BUDGET_EMAIL or pass --budget-email before azure:bootstrap --apply.",
    false,
  );
}

async function main() {
  await loadEnvLocal();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  checkLocalTooling();
  const azure = checkAzureCli();
  checkActivationConfig();
  checkProviders(azure.az && azure.loggedIn);

  const requiredFailures = checks.filter((check) => check.required && !check.ok);
  if (JSON_OUTPUT) {
    console.log(
      JSON.stringify(
        {
          ok: requiredFailures.length === 0,
          apply: APPLY,
          register_providers: REGISTER_PROVIDERS,
          checks,
        },
        null,
        2,
      ),
    );
  } else {
    const passed = checks.filter((check) => check.ok).length;
    console.log(`\n${passed}/${checks.length} prerequisite checks passed`);
    if (requiredFailures.length > 0) {
      console.log(`${requiredFailures.length} required prerequisite checks failed`);
    }
    if (REGISTER_PROVIDERS && !APPLY) {
      console.log("\n# Provider registration was dry-run only; add --apply to mutate Azure.");
    }
  }

  if (requiredFailures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
