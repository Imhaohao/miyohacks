#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const OUT_DIR = "data/fine-tuning";
const MANIFEST_PATH = join(OUT_DIR, "azure-finetune-manifest.json");
const DRY_RUN_MANIFEST_PATH = join(OUT_DIR, "azure-finetune-manifest.dryrun.json");
const APPLY = process.argv.includes("--apply");

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
  npm run azure:ft:pipeline
  npm run azure:ft:pipeline -- start --apply
  npm run azure:ft:pipeline -- status
  npm run azure:ft:pipeline -- deploy --apply

Commands:
  start   Generate JSONL, upload train/validation files, create judge+suggester jobs.
  status  Refresh job status in ${MANIFEST_PATH}.
  deploy  Deploy completed jobs to arbor-judge and arbor-suggester deployments.

Dry-run is the default. Add --apply for Azure side effects.
`);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function endpoint() {
  const value = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  if (!value) throw new Error("AZURE_OPENAI_ENDPOINT is required");
  return value.replace(/\/+$/, "").replace(/\/openai\/v1$/i, "");
}

function apiKey() {
  const value = process.env.AZURE_OPENAI_API_KEY?.trim();
  if (!value) throw new Error("AZURE_OPENAI_API_KEY is required");
  return value;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function openAIResourceName() {
  const explicit = process.env.AZURE_OPENAI_RESOURCE_NAME?.trim();
  if (explicit) return explicit;
  const match = endpoint().match(/^https:\/\/([^.]+)\.openai\.azure\.com/i);
  if (match) return match[1];
  throw new Error("AZURE_OPENAI_RESOURCE_NAME is required");
}

function managementToken() {
  const explicit = process.env.AZURE_MANAGEMENT_TOKEN?.trim();
  if (explicit) return explicit;
  const result = spawnSync(
    "az",
    [
      "account",
      "get-access-token",
      "--resource",
      "https://management.azure.com",
      "--query",
      "accessToken",
      "-o",
      "tsv",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error) {
    throw new Error(
      `Azure CLI failed to start (${result.error.message}). Install az or set AZURE_MANAGEMENT_TOKEN.`,
    );
  }
  if (result.status !== 0) throw new Error(result.stderr);
  const token = result.stdout.trim();
  if (!token) throw new Error("az did not return a management token");
  return token;
}

async function request(path, init = {}) {
  const res = await fetch(`${endpoint()}${path}`, {
    ...init,
    headers: {
      "api-key": apiKey(),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Preserve text for errors.
  }
  if (!res.ok) {
    throw new Error(
      `Azure OpenAI HTTP ${res.status}: ${typeof body === "string" ? body.slice(0, 600) : JSON.stringify(body, null, 2)}`,
    );
  }
  return body;
}

async function managementRequest(path, init = {}) {
  const res = await fetch(`https://management.azure.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${managementToken()}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Preserve text for errors.
  }
  if (!res.ok) {
    throw new Error(
      `Azure Management HTTP ${res.status}: ${typeof body === "string" ? body.slice(0, 600) : JSON.stringify(body, null, 2)}`,
    );
  }
  return body;
}

function run(args, opts = {}) {
  console.log(`$ ${args.join(" ")}`);
  if (!APPLY && !opts.always) return;
  const result = spawnSync(args[0], args.slice(1), {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  if (result.error) {
    throw new Error(`${args[0]} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${args[0]} exited with ${result.status}`);
  }
}

function parseJsonlCount(path) {
  let raw = readFileSync(path, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return raw.trim().split(/\n/).filter(Boolean).length;
}

async function upload(path) {
  if (!APPLY) {
    return { id: `dryrun:${basename(path)}`, filename: basename(path) };
  }
  const bytes = await readFile(path);
  const form = new FormData();
  form.append("purpose", "fine-tune");
  form.append("file", new Blob([bytes], { type: "application/jsonl" }), basename(path));
  return await request("/openai/v1/files", { method: "POST", body: form });
}

async function createJob(args) {
  if (!APPLY) {
    return {
      id: `dryrun:${args.role}:job`,
      status: "dry_run",
      model: args.model,
      training_file: args.trainingFile,
      validation_file: args.validationFile,
    };
  }
  return await request("/openai/v1/fine_tuning/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: args.model,
      training_file: args.trainingFile,
      validation_file: args.validationFile,
      suffix: args.suffix,
      seed: Number(arg("seed", "105")),
      trainingType: arg("training-type", "GlobalStandard"),
    }),
  });
}

async function getJob(jobId) {
  return await request(`/openai/v1/fine_tuning/jobs/${jobId}`, { method: "GET" });
}

function modelFromJob(job) {
  if (typeof job.fine_tuned_model === "string" && job.fine_tuned_model) {
    return job.fine_tuned_model;
  }
  if (
    typeof job.fine_tuned_model_checkpoint === "string" &&
    job.fine_tuned_model_checkpoint
  ) {
    return job.fine_tuned_model_checkpoint;
  }
  return null;
}

async function deploy(role, job, deploymentName) {
  const model = modelFromJob(job) || job.fine_tuned_model || job.model_id;
  if (!model) {
    throw new Error(`No deployable fine-tuned model found for ${role}`);
  }
  if (!APPLY) {
    return { id: `dryrun:${role}:deployment`, model, deployment: deploymentName };
  }

  const subscription = requiredEnv("AZURE_SUBSCRIPTION_ID");
  const resourceGroup = requiredEnv("AZURE_RESOURCE_GROUP");
  const resourceName = openAIResourceName();
  const apiVersion = arg("management-api-version", "2024-10-21");
  const path =
    `/subscriptions/${encodeURIComponent(subscription)}` +
    `/resourceGroups/${encodeURIComponent(resourceGroup)}` +
    `/providers/Microsoft.CognitiveServices/accounts/${encodeURIComponent(resourceName)}` +
    `/deployments/${encodeURIComponent(deploymentName)}` +
    `?api-version=${encodeURIComponent(apiVersion)}`;

  return await managementRequest(path, {
    method: "PUT",
    body: JSON.stringify({
      sku: {
        name: arg("sku", "GlobalStandard"),
        capacity: Number(arg("capacity", "1")),
      },
      properties: {
        model: {
          format: "OpenAI",
          name: model,
          version: "1",
        },
      },
    }),
  });
}

function roleConfig() {
  return {
    suggester: {
      role: "suggester",
      trainPath: join(OUT_DIR, "arbor-suggester.train.jsonl"),
      validationPath: join(OUT_DIR, "arbor-suggester.validation.jsonl"),
      suffix: arg("suggester-suffix", "arb-suggest"),
      deployment: arg(
        "suggester-deployment",
        process.env.AZURE_OPENAI_SUGGESTER_FINE_TUNED_DEPLOYMENT ||
          "arbor-suggester",
      ),
    },
    judge: {
      role: "judge",
      trainPath: join(OUT_DIR, "arbor-judge.train.jsonl"),
      validationPath: join(OUT_DIR, "arbor-judge.validation.jsonl"),
      suffix: arg("judge-suffix", "arb-judge"),
      deployment: arg(
        "judge-deployment",
        process.env.AZURE_OPENAI_JUDGE_FINE_TUNED_DEPLOYMENT || "arbor-judge",
      ),
    },
  };
}

function baseManifest() {
  return {
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "",
    model: arg("model", "gpt-4.1-mini-2025-04-14"),
    training_type: arg("training-type", "GlobalStandard"),
    apply: APPLY,
    roles: {},
  };
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`${MANIFEST_PATH} does not exist. Run: npm run azure:ft:pipeline -- start --apply`);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

async function saveManifest(manifest) {
  manifest.updated_at = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  const path = APPLY ? MANIFEST_PATH : DRY_RUN_MANIFEST_PATH;
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${path}`);
}

async function start() {
  if (!APPLY) console.log("# dry run only; add --apply to upload/create jobs");
  run(["npm", "run", "ft:data"], { always: true });
  run(["npm", "run", "ft:validate"], { always: true });
  run(["npm", "run", "ft:eval"], { always: true });

  const manifest = baseManifest();
  manifest.validation_report_path = join(OUT_DIR, "validation-report.json");
  manifest.eval_report_path = join(OUT_DIR, "eval-report.json");
  const model = manifest.model;
  for (const cfg of Object.values(roleConfig())) {
    const train = await upload(cfg.trainPath);
    const validation = await upload(cfg.validationPath);
    const job = await createJob({
      role: cfg.role,
      model,
      trainingFile: train.id,
      validationFile: validation.id,
      suffix: cfg.suffix,
    });
    manifest.roles[cfg.role] = {
      train_path: cfg.trainPath,
      validation_path: cfg.validationPath,
      test_path: join(OUT_DIR, `arbor-${cfg.role}.test.jsonl`),
      train_examples: parseJsonlCount(cfg.trainPath),
      validation_examples: parseJsonlCount(cfg.validationPath),
      test_examples: parseJsonlCount(join(OUT_DIR, `arbor-${cfg.role}.test.jsonl`)),
      train_file_id: train.id,
      validation_file_id: validation.id,
      job_id: job.id,
      job_status: job.status ?? "created",
      deployment: cfg.deployment,
    };
  }
  await saveManifest(manifest);
}

async function status() {
  const manifest = loadManifest();
  for (const [role, entry] of Object.entries(manifest.roles)) {
    if (!entry.job_id || entry.job_id.startsWith("dryrun:")) continue;
    const job = await getJob(entry.job_id);
    entry.job_status = job.status ?? entry.job_status;
    entry.fine_tuned_model = modelFromJob(job) ?? entry.fine_tuned_model;
    entry.last_job = {
      id: job.id,
      status: job.status,
      fine_tuned_model: job.fine_tuned_model,
      finished_at: job.finished_at,
    };
    console.log(`${role}: ${entry.job_status}${entry.fine_tuned_model ? ` (${entry.fine_tuned_model})` : ""}`);
  }
  await saveManifest(manifest);
}

async function deployAll() {
  const manifest = loadManifest();
  for (const [role, entry] of Object.entries(manifest.roles)) {
    let job = entry.last_job ?? {};
    if (entry.job_id && !entry.job_id.startsWith("dryrun:")) {
      job = await getJob(entry.job_id);
    }
    const fineTunedModel = modelFromJob(job) ?? entry.fine_tuned_model;
    if (!fineTunedModel) {
      throw new Error(`${role} is not deployable yet; run status after the job succeeds`);
    }
    const result = await deploy(role, { ...job, fine_tuned_model: fineTunedModel }, entry.deployment);
    entry.deployed_model = fineTunedModel;
    entry.deployed_at = new Date().toISOString();
    entry.deployment_result = result;
    console.log(`${role}: deployed ${fineTunedModel} to ${entry.deployment}`);
  }
  await saveManifest(manifest);
  console.log("\n# Switch Arbor to fine-tuned deployments:");
  console.log("AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge \\");
  console.log("AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester \\");
  console.log("npm run azure:env -- convex --apply");
}

async function main() {
  await loadEnvLocal();
  const command = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "start";
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  if (command === "start") await start();
  else if (command === "status") await status();
  else if (command === "deploy") await deployAll();
  else throw new Error(`Unknown command "${command}"`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
