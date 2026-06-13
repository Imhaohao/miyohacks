#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function loadEnvFile(path) {
  try {
    const raw = await readFile(path, "utf8");
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
  npm run azure:devtools:smoke
  npm run azure:devtools:smoke -- --env-file .env.azure-devtools

Uses OpenAI-compatible coding-tool env:
  OPENAI_BASE_URL
  OPENAI_API_KEY
  OPENAI_MODEL
  OPENAI_API_KEY_HEADER=api-key

This makes one paid low-token request when credentials are configured.
`);
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

function appendPath(base, path) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function headers() {
  const key = env("OPENAI_API_KEY");
  if (!key || key.startsWith("<")) throw new Error("OPENAI_API_KEY is not configured");
  const header = (env("OPENAI_API_KEY_HEADER") || "authorization").toLowerCase();
  if (header === "api-key") return { "api-key": key };
  return { authorization: `Bearer ${key}` };
}

function responseText(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  await loadEnvFile(join(process.cwd(), ".env.local"));
  await loadEnvFile(arg("env-file", ".env.azure-devtools"));

  const baseURL = env("OPENAI_BASE_URL");
  const model = env("OPENAI_MODEL");
  if (!baseURL) throw new Error("OPENAI_BASE_URL is not configured");
  if (!model) throw new Error("OPENAI_MODEL is not configured");

  const url = appendPath(baseURL, "chat/completions");
  console.log(
    JSON.stringify(
      {
        OPENAI_BASE_URL: baseURL.replace(/\/+$/, ""),
        OPENAI_MODEL: model,
        OPENAI_API_KEY_HEADER: env("OPENAI_API_KEY_HEADER") || "authorization",
      },
      null,
      2,
    ),
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers(),
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a one-line smoke test for an OpenAI-compatible coding tool endpoint.",
        },
        {
          role: "user",
          content: "Reply with exactly: devtools route ok",
        },
      ],
      max_completion_tokens: Number(arg("max-tokens", "32")),
    }),
  });

  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Preserve raw text for errors.
  }
  if (!response.ok) {
    throw new Error(
      `Devtools endpoint error ${response.status}: ${
        typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body, null, 2)
      }`,
    );
  }
  const output = responseText(body).trim();
  if (!output) throw new Error("Devtools endpoint returned no text");
  console.log(output);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
