import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  callOpenAI,
  describeModelRuntime,
  type ModelPurpose,
} from "../lib/openai";

const PURPOSES = new Set<ModelPurpose>([
  "default",
  "agent",
  "judge",
  "suggester",
  "intake",
  "planner",
  "discovery",
  "demo",
]);

async function loadEnvLocal(): Promise<void> {
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
    // Optional; CI or deployed environments can provide real env vars directly.
  }
}

function cleanPurpose(value: string | undefined): ModelPurpose {
  if (!value) return "default";
  if (PURPOSES.has(value as ModelPurpose)) return value as ModelPurpose;
  throw new Error(
    `Unknown purpose "${value}". Use one of: ${Array.from(PURPOSES).join(", ")}`,
  );
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const purpose = cleanPurpose(process.argv[2]);
  const runtime = describeModelRuntime(purpose);
  console.log(
    JSON.stringify(
      {
        ...runtime,
        endpoint: runtime.endpoint?.replace(/\/+$/, ""),
      },
      null,
      2,
    ),
  );

  const text = await callOpenAI({
    purpose,
    systemPrompt:
      "You are a smoke test for Arbor's model provider. Reply with exactly one short sentence.",
    userPrompt: `Confirm the ${purpose} model route is alive.`,
    maxTokens: 80,
    timeoutMs: 20_000,
    retries: 0,
  });

  console.log("\n" + text.trim());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
