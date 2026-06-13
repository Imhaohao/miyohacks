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
const VERIFY = process.argv.includes("--verify");
const VERCEL = process.argv.includes("--vercel");
const DELETE_RESOURCE_GROUP = process.argv.includes("--delete-resource-group");

function usage() {
  console.log(`Usage:
  npm run azure:off
  npm run azure:off -- --apply
  npm run azure:off -- --verify
  npm run azure:off -- --apply --verify
  npm run azure:off -- --apply --vercel
  npm run azure:off -- --delete-resource-group --resource-group arbor-ai-rg
  npm run azure:off -- --apply --delete-resource-group --resource-group arbor-ai-rg --confirm-resource-group arbor-ai-rg

Dry-run is the default. Add --apply to mutate Convex/Azure state.
Add --verify to check Convex env and configured Azure app state are off.
Add --vercel to include hosted Vercel env variables in the off switch.
Add --delete-resource-group to hard-stop Azure resource charges by deleting the
configured Arbor resource group. Applying that flag requires
--confirm-resource-group <name>.
`);
}

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function run(args, cwd = process.cwd()) {
  console.log(`$ ${args.join(" ")}`);
  if (!APPLY) return;
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw new Error(`${args[0]} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${args[0]} exited with ${result.status}`);
  }
}

function capture(args, cwd = process.cwd()) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
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
  const result = capture(["sh", "-lc", `command -v ${name}`]);
  return result.ok ? result.stdout : "";
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function convexEnvArgs(command, ...args) {
  const deployment = process.env.CONVEX_DEPLOYMENT?.trim();
  return deployment
    ? ["npx", "convex", "env", "--deployment", deployment, command, ...args]
    : ["npx", "convex", "env", command, ...args];
}

function maybeRunAzureScaleOff() {
  const rg = process.env.AZURE_RESOURCE_GROUP;
  const app = process.env.AZURE_CONTAINER_APP_NAME ?? process.env.ARBOR_WORKER_CONTAINER_APP;
  if (!rg || !app) {
    console.log(
      "# skipped Azure Container Apps scale-down; set AZURE_RESOURCE_GROUP and AZURE_CONTAINER_APP_NAME",
    );
    return;
  }
  run([
    "az",
    "containerapp",
    "update",
    "--resource-group",
    rg,
    "--name",
    app,
    "--min-replicas",
    "0",
    "--max-replicas",
    "0",
  ]);
}

function maybeRunAppServiceOff() {
  const rg = process.env.AZURE_RESOURCE_GROUP;
  const app = process.env.AZURE_WEBAPP_NAME;
  if (!rg || !app) {
    console.log(
      "# skipped Azure Web App stop; set AZURE_RESOURCE_GROUP and AZURE_WEBAPP_NAME if Arbor runs on App Service",
    );
    return;
  }
  run(["az", "webapp", "stop", "--resource-group", rg, "--name", app]);
}

function maybeDeleteResourceGroup() {
  if (!DELETE_RESOURCE_GROUP) {
    console.log(
      "# skipped Azure resource-group deletion; pass --delete-resource-group for hard cost stop",
    );
    return;
  }
  const rg = arg("resource-group", process.env.AZURE_RESOURCE_GROUP || "");
  if (!rg) {
    if (APPLY) {
      throw new Error(
        "Refusing hard-off apply without AZURE_RESOURCE_GROUP or --resource-group.",
      );
    }
    console.log(
      "# skipped Azure resource-group deletion; set AZURE_RESOURCE_GROUP or pass --resource-group",
    );
    return;
  }
  if (APPLY) {
    const confirmed = arg("confirm-resource-group", "");
    if (confirmed !== rg) {
      throw new Error(
        `Refusing to delete resource group "${rg}" without --confirm-resource-group ${rg}.`,
      );
    }
    if (!commandExists("az")) {
      throw new Error("Azure CLI is required to delete the Arbor resource group.");
    }
  }
  run(["az", "group", "delete", "--name", rg, "--yes", "--no-wait"]);
  console.log(
    "# Azure resource-group deletion is asynchronous; rerun with --verify after Azure reports deletion complete.",
  );
}

function maybeRunVercelOff() {
  if (!VERCEL) {
    console.log("# skipped Vercel hosted env shutoff; pass --vercel to include it");
    return;
  }
  const args = ["npm", "run", "azure:vercel", "--", "off"];
  if (APPLY) args.push("--apply");
  if (APPLY) {
    run(args);
    return;
  }
  const result = spawnSync(args[0], args.slice(1), {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw new Error(`${args[0]} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${args[0]} exited with ${result.status}`);
  }
}

function verifyConvexOff() {
  for (const [key, expected] of [
    ["ARBOR_MODEL_PROVIDER", "disabled"],
    ["ARBOR_AZURE_ENABLED", "false"],
    ["ARBOR_MODEL_SPEND_DISABLED", "true"],
    ["ARBOR_REQUIRE_AZURE", "true"],
  ]) {
    const result = capture(convexEnvArgs("get", key));
    record(
      `Convex ${key}`,
      result.ok && result.stdout === expected,
      result.ok ? result.stdout || "(empty)" : result.stderr,
    );
  }
}

function verifyContainerAppOff() {
  const rg = process.env.AZURE_RESOURCE_GROUP;
  const app = process.env.AZURE_CONTAINER_APP_NAME ?? process.env.ARBOR_WORKER_CONTAINER_APP;
  if (!rg || !app) {
    record("Azure Container Apps worker off", true, "skipped; no container app configured");
    return;
  }
  if (!commandExists("az")) {
    record("Azure Container Apps worker off", false, "Azure CLI is not installed");
    return;
  }
  const result = capture([
    "az",
    "containerapp",
    "show",
    "--resource-group",
    rg,
    "--name",
    app,
    "--query",
    "properties.template.scale",
    "-o",
    "json",
  ]);
  if (!result.ok) {
    record("Azure Container Apps worker off", false, result.stderr);
    return;
  }
  try {
    const scale = JSON.parse(result.stdout);
    record(
      "Azure Container Apps worker off",
      Number(scale.minReplicas) === 0 && Number(scale.maxReplicas) === 0,
      `min=${scale.minReplicas ?? "?"} max=${scale.maxReplicas ?? "?"}`,
    );
  } catch {
    record("Azure Container Apps worker off", false, result.stdout || "invalid JSON");
  }
}

function verifyAppServiceOff() {
  const rg = process.env.AZURE_RESOURCE_GROUP;
  const app = process.env.AZURE_WEBAPP_NAME;
  if (!rg || !app) {
    record("Azure Web App off", true, "skipped; no web app configured");
    return;
  }
  if (!commandExists("az")) {
    record("Azure Web App off", false, "Azure CLI is not installed");
    return;
  }
  const result = capture([
    "az",
    "webapp",
    "show",
    "--resource-group",
    rg,
    "--name",
    app,
    "--query",
    "state",
    "-o",
    "tsv",
  ]);
  record(
    "Azure Web App off",
    result.ok && result.stdout === "Stopped",
    result.ok ? result.stdout || "(empty)" : result.stderr,
  );
}

function verifyResourceGroupDeleted() {
  if (!DELETE_RESOURCE_GROUP) {
    record("Azure resource group hard-off", true, "skipped; pass --delete-resource-group to verify");
    return;
  }
  const rg = arg("resource-group", process.env.AZURE_RESOURCE_GROUP || "");
  if (!rg) {
    record("Azure resource group hard-off", false, "missing AZURE_RESOURCE_GROUP");
    return;
  }
  if (!commandExists("az")) {
    record("Azure resource group hard-off", false, "Azure CLI is not installed");
    return;
  }
  const result = capture(["az", "group", "exists", "--name", rg, "-o", "tsv"]);
  record(
    "Azure resource group hard-off",
    result.ok && result.stdout === "false",
    result.ok ? `${rg} exists=${result.stdout}` : result.stderr,
  );
}

function verifyLocalOff() {
  record(
    "local ARBOR_MODEL_PROVIDER",
    process.env.ARBOR_MODEL_PROVIDER === "disabled",
    process.env.ARBOR_MODEL_PROVIDER || "missing",
  );
  record(
    "local ARBOR_MODEL_SPEND_DISABLED",
    process.env.ARBOR_MODEL_SPEND_DISABLED === "true",
    process.env.ARBOR_MODEL_SPEND_DISABLED || "missing",
  );
}

function verifyOff() {
  verifyLocalOff();
  verifyConvexOff();
  verifyContainerAppOff();
  verifyAppServiceOff();
  verifyResourceGroupDeleted();
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} off checks passed`);
  if (failed.length > 0) process.exit(1);
}

async function main() {
  await loadEnvLocal();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  if (!APPLY && !VERIFY) {
    console.log("# dry run only; add --apply to execute");
  }

  if (!VERIFY || APPLY) {
    run(convexEnvArgs("set", "ARBOR_MODEL_PROVIDER", "disabled"));
    run(convexEnvArgs("set", "ARBOR_AZURE_ENABLED", "false"));
    run(convexEnvArgs("set", "ARBOR_MODEL_SPEND_DISABLED", "true"));
    run(convexEnvArgs("set", "ARBOR_REQUIRE_AZURE", "true"));

    maybeRunAzureScaleOff();
    maybeRunAppServiceOff();
    maybeRunVercelOff();
    maybeDeleteResourceGroup();

    console.log(
      "# local/offline switch: set ARBOR_MODEL_PROVIDER=disabled and ARBOR_MODEL_SPEND_DISABLED=true in .env.local",
    );
  }

  if (VERIFY) verifyOff();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
