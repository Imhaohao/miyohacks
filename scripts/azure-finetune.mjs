#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

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
    // Environment can be supplied by shell, CI, or Azure task variables.
  }
}

function usage() {
  console.log(`Usage:
  npm run azure:ft -- upload <jsonl-path>
  npm run azure:ft -- create --training-file <file-id> [--validation-file <file-id>] [--model gpt-4.1-2025-04-14] [--suffix arb-judge] [--training-type GlobalStandard]
  npm run azure:ft -- status <job-id>
  npm run azure:ft -- events <job-id>
  npm run azure:ft -- checkpoints <job-id>
  npm run azure:ft -- deploy --model <fine-tuned-model-or-checkpoint> --deployment <deployment-name>
  npm run azure:ft -- deploy --from-job <job-id> --deployment <deployment-name>
  npm run azure:ft -- pause <job-id>
  npm run azure:ft -- resume <job-id>

Required env:
  AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
  AZURE_OPENAI_API_KEY=...

Deploy env:
  AZURE_SUBSCRIPTION_ID=...
  AZURE_RESOURCE_GROUP=...
  AZURE_OPENAI_RESOURCE_NAME=<resource-name>
  AZURE_MANAGEMENT_TOKEN=<optional; otherwise uses az account get-access-token>
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
  throw new Error(
    "AZURE_OPENAI_RESOURCE_NAME is required when it cannot be parsed from AZURE_OPENAI_ENDPOINT",
  );
}

function managementToken() {
  const explicit = process.env.AZURE_MANAGEMENT_TOKEN?.trim();
  if (explicit) return explicit;
  const result = spawnAz([
    "account",
    "get-access-token",
    "--resource",
    "https://management.azure.com",
    "--query",
    "accessToken",
    "-o",
    "tsv",
  ]);
  const token = result.stdout.trim();
  if (!token) throw new Error("az did not return an Azure management token");
  return token;
}

function spawnAz(args) {
  const result = spawnSync("az", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (result.error) {
    throw new Error(
      `Azure CLI failed to start (${result.error.message}). Install az or set AZURE_MANAGEMENT_TOKEN.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `az exited with ${result.status}`);
  }
  return result;
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
    // Preserve text for error messages.
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
    // Preserve text for error messages.
  }
  if (!res.ok) {
    throw new Error(
      `Azure Management HTTP ${res.status}: ${typeof body === "string" ? body.slice(0, 600) : JSON.stringify(body, null, 2)}`,
    );
  }
  return body;
}

async function uploadFile(path) {
  if (!path) throw new Error("upload requires a JSONL path");
  const bytes = await readFile(path);
  const form = new FormData();
  form.append("purpose", "fine-tune");
  form.append(
    "file",
    new Blob([bytes], { type: "application/jsonl" }),
    basename(path),
  );
  return await request("/openai/v1/files", {
    method: "POST",
    body: form,
  });
}

async function createJob() {
  const trainingFile = arg("training-file");
  if (!trainingFile) throw new Error("--training-file is required");
  const validationFile = arg("validation-file");
  const body = {
    model: arg("model", "gpt-4.1-2025-04-14"),
    training_file: trainingFile,
    ...(validationFile ? { validation_file: validationFile } : {}),
    ...(arg("suffix") ? { suffix: arg("suffix") } : {}),
    seed: Number(arg("seed", "105")),
  };

  const nEpochs = arg("n-epochs");
  if (nEpochs) {
    body.method = {
      type: "supervised",
      supervised: {
        hyperparameters: {
          n_epochs: Number(nEpochs),
        },
      },
    };
  }

  const trainingType = arg("training-type");
  if (trainingType) body.trainingType = trainingType;

  return await request("/openai/v1/fine_tuning/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getJob(jobId) {
  return await jobCommand(jobId, "");
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
  const checkpoints = Array.isArray(job.checkpoints) ? job.checkpoints : [];
  const firstCheckpoint = checkpoints.find(
    (checkpoint) => checkpoint && typeof checkpoint === "object",
  );
  if (
    firstCheckpoint &&
    typeof firstCheckpoint.id === "string" &&
    firstCheckpoint.id
  ) {
    return firstCheckpoint.id;
  }
  return null;
}

async function deployFineTunedModel() {
  let model = arg("model");
  const fromJob = arg("from-job");
  const deployment = arg("deployment");
  if (!model && fromJob) {
    const job = await getJob(fromJob);
    model = modelFromJob(job);
    if (!model) {
      throw new Error(
        `Could not find fine_tuned_model on job ${fromJob}. Job status: ${JSON.stringify(job, null, 2).slice(0, 1200)}`,
      );
    }
  }
  if (!model) throw new Error("--model or --from-job is required");
  if (!deployment) throw new Error("--deployment is required");

  const subscription = requiredEnv("AZURE_SUBSCRIPTION_ID");
  const resourceGroup = requiredEnv("AZURE_RESOURCE_GROUP");
  const resourceName = openAIResourceName();
  const apiVersion = arg("management-api-version", "2024-10-21");
  const skuName = arg("sku", "GlobalStandard");
  const capacity = Number(arg("capacity", "1"));
  const method = arg("method", "PUT").toUpperCase();

  const path =
    `/subscriptions/${encodeURIComponent(subscription)}` +
    `/resourceGroups/${encodeURIComponent(resourceGroup)}` +
    `/providers/Microsoft.CognitiveServices/accounts/${encodeURIComponent(resourceName)}` +
    `/deployments/${encodeURIComponent(deployment)}` +
    `?api-version=${encodeURIComponent(apiVersion)}`;

  return await managementRequest(path, {
    method,
    body: JSON.stringify({
      sku: {
        name: skuName,
        capacity,
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

async function jobCommand(jobId, suffix, method = "GET") {
  if (!jobId) throw new Error("job id is required");
  return await request(`/openai/v1/fine_tuning/jobs/${jobId}${suffix}`, {
    method,
    headers: method === "POST" ? { "content-type": "application/json" } : {},
  });
}

async function main() {
  await loadEnvLocal();
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  let result;
  if (command === "upload") result = await uploadFile(process.argv[3]);
  else if (command === "create") result = await createJob();
  else if (command === "status") result = await jobCommand(process.argv[3], "");
  else if (command === "events") result = await jobCommand(process.argv[3], "/events", "POST");
  else if (command === "checkpoints") {
    result = await jobCommand(process.argv[3], "/checkpoints", "POST");
  } else if (command === "deploy") {
    result = await deployFineTunedModel();
  } else if (command === "pause") {
    result = await jobCommand(process.argv[3], "/pause", "POST");
  } else if (command === "resume") {
    result = await jobCommand(process.argv[3], "/resume", "POST");
  } else {
    throw new Error(`Unknown command "${command}"`);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
