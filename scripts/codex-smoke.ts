#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCodexViaGitHub } from "../lib/codex-github-runner";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const raw = match[2].trim();
    process.env[match[1]] = raw.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const [, , targetRepo, ...rest] = process.argv;
const prompt = rest.join(" ");
if (!targetRepo || !prompt) {
  console.error("Usage: codex-smoke.ts <owner/repo> <prompt>");
  process.exit(1);
}

const result = await runCodexViaGitHub({
  agent_id: "codex-writer",
  prompt,
  task_type: "implementation",
  target_repo: targetRepo,
});

console.log(JSON.stringify(result, null, 2));
