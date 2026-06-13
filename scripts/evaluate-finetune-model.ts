import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { callOpenAI, describeModelRuntime, type ModelPurpose } from "../lib/openai";

type Role = "system" | "user" | "assistant";
type EvalRole = "judge" | "suggester";

interface FineTuneMessage {
  role: Role;
  content: string;
}

interface FineTuneExample {
  messages: FineTuneMessage[];
}

interface JudgeOutput {
  verdict?: unknown;
  reasoning?: unknown;
  quality_score?: unknown;
}

interface SuggesterOutput {
  ranked?: Array<{
    agent_id?: unknown;
    fit_score?: unknown;
    fit_reasoning?: unknown;
  }>;
}

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
      process.env[key] =
        process.env[key]?.trim().replace(/\s+#.*$/, "").trim() || value;
    }
  } catch {
    // Optional.
  }
}

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function parseRole(): EvalRole | "all" {
  const positional = process.argv.slice(2).find((value) => !value.startsWith("--"));
  const role = arg("role", positional ?? "all");
  if (role === "judge" || role === "suggester" || role === "all") return role;
  throw new Error(`Unknown role "${role}". Use judge, suggester, or all.`);
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) return JSON.parse(fence[1]);
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject !== -1 && lastObject > firstObject) {
      return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
    }
    throw new Error(`Could not parse JSON: ${trimmed.slice(0, 160)}`);
  }
}

async function readJsonl(path: string): Promise<FineTuneExample[]> {
  const raw = stripBom(await readFile(path, "utf8"));
  const examples: FineTuneExample[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      examples.push(JSON.parse(line) as FineTuneExample);
    } catch (err) {
      throw new Error(
        `${path}:${index + 1} invalid JSONL: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  });
  return examples;
}

function promptParts(example: FineTuneExample): {
  systemPrompt: string;
  userPrompt: string;
  reference: string;
} {
  const systemPrompt =
    example.messages.find((message) => message.role === "system")?.content ?? "";
  const userPrompt =
    example.messages.findLast((message) => message.role === "user")?.content ?? "";
  const reference =
    example.messages.findLast((message) => message.role === "assistant")?.content ?? "";
  return { systemPrompt, userPrompt, reference };
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function scoreJudge(referenceText: string, candidateText: string): {
  json_valid: boolean;
  verdict_match: boolean;
  quality_delta: number | null;
  score: number;
  error?: string;
} {
  try {
    const reference = parseJsonLoose(referenceText) as JudgeOutput;
    const candidate = parseJsonLoose(candidateText) as JudgeOutput;
    const verdictMatch =
      (reference.verdict === "accept" || reference.verdict === "reject") &&
      candidate.verdict === reference.verdict;
    const referenceQuality =
      typeof reference.quality_score === "number" ? reference.quality_score : null;
    const candidateQuality =
      typeof candidate.quality_score === "number" ? candidate.quality_score : null;
    const qualityDelta =
      referenceQuality === null || candidateQuality === null
        ? null
        : Math.abs(referenceQuality - candidateQuality);
    return {
      json_valid: true,
      verdict_match: verdictMatch,
      quality_delta: qualityDelta,
      score: verdictMatch ? 1 : 0,
    };
  } catch (err) {
    return {
      json_valid: false,
      verdict_match: false,
      quality_delta: null,
      score: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function rankedIds(output: unknown): string[] {
  const ranked = (output as SuggesterOutput | null)?.ranked;
  if (!Array.isArray(ranked)) return [];
  return ranked
    .map((item) => item.agent_id)
    .filter((agentId): agentId is string => typeof agentId === "string" && Boolean(agentId));
}

function goldIds(reference: unknown): Set<string> {
  const ranked = (reference as SuggesterOutput | null)?.ranked;
  if (!Array.isArray(ranked)) return new Set();
  const strong = ranked.filter(
    (item) => typeof item.fit_score === "number" && item.fit_score >= 0.9,
  );
  const source = strong.length ? strong : ranked.slice(0, 1);
  return new Set(
    source
      .map((item) => item.agent_id)
      .filter((agentId): agentId is string => typeof agentId === "string" && Boolean(agentId)),
  );
}

function scoreSuggester(referenceText: string, candidateText: string): {
  json_valid: boolean;
  acc1: number;
  acc3: number;
  rr: number;
  score: number;
  error?: string;
} {
  try {
    const reference = parseJsonLoose(referenceText);
    const candidate = parseJsonLoose(candidateText);
    const gold = goldIds(reference);
    const ranked = rankedIds(candidate);
    if (!gold.size || !ranked.length) {
      return {
        json_valid: true,
        acc1: 0,
        acc3: 0,
        rr: 0,
        score: 0,
        error: "missing gold or ranked ids",
      };
    }
    const acc1 = gold.has(ranked[0]) ? 1 : 0;
    const acc3 = ranked.slice(0, 3).some((id) => gold.has(id)) ? 1 : 0;
    const first = ranked.findIndex((id) => gold.has(id));
    const rr = first === -1 ? 0 : 1 / (first + 1);
    return { json_valid: true, acc1, acc3, rr, score: acc1 };
  } catch (err) {
    return {
      json_valid: false,
      acc1: 0,
      acc3: 0,
      rr: 0,
      score: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function candidateOutput(role: EvalRole, example: FineTuneExample): Promise<string> {
  if (!hasFlag("live")) return promptParts(example).reference;
  const { systemPrompt, userPrompt } = promptParts(example);
  return await callOpenAI({
    purpose: role as ModelPurpose,
    systemPrompt,
    userPrompt,
    maxTokens: role === "suggester" ? 1400 : 500,
    timeoutMs: Number(arg("timeout-ms", "30000")),
    retries: Number(arg("retries", "0")),
  });
}

async function evaluateRole(dir: string, role: EvalRole): Promise<unknown> {
  const path = join(dir, `arbor-${role}.test.jsonl`);
  const examples = await readJsonl(path);
  const perExample = [];
  for (const [index, example] of examples.entries()) {
    const { reference } = promptParts(example);
    const candidate = await candidateOutput(role, example);
    const score =
      role === "judge"
        ? scoreJudge(reference, candidate)
        : scoreSuggester(reference, candidate);
    perExample.push({
      index,
      ...score,
      candidate: hasFlag("include-output") ? candidate : undefined,
    });
  }
  const jsonValid = mean(perExample.map((row) => (row.json_valid ? 1 : 0)));
  if (role === "judge") {
    const verdictAccuracy = mean(
      perExample.map((row) => ("verdict_match" in row && row.verdict_match ? 1 : 0)),
    );
    return {
      role,
      path,
      n: examples.length,
      json_valid: jsonValid,
      verdict_accuracy: verdictAccuracy,
      score: verdictAccuracy,
      examples: perExample,
    };
  }
  const acc1 = mean(perExample.map((row) => ("acc1" in row ? row.acc1 : 0)));
  const acc3 = mean(perExample.map((row) => ("acc3" in row ? row.acc3 : 0)));
  const mrr = mean(perExample.map((row) => ("rr" in row ? row.rr : 0)));
  return {
    role,
    path,
    n: examples.length,
    json_valid: jsonValid,
    acc1,
    acc3,
    mrr,
    score: acc1,
    examples: perExample,
  };
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const dir = arg("dir", "data/fine-tuning");
  const role = parseRole();
  const output = arg("output", join(dir, "eval-report.json"));
  const roles: EvalRole[] = role === "all" ? ["judge", "suggester"] : [role];
  const runtime = hasFlag("live")
    ? Object.fromEntries(roles.map((item) => [item, describeModelRuntime(item)]))
    : {};
  const results = [];
  for (const item of roles) {
    results.push(await evaluateRole(dir, item));
  }
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    mode: hasFlag("live") ? "live" : "reference",
    runtime,
    results,
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  for (const result of results) {
    const row = result as { role: string; n: number; score: number; json_valid: number };
    console.log(
      `${row.role}: n=${row.n} score=${row.score.toFixed(3)} json=${row.json_valid.toFixed(3)}`,
    );
  }
  console.log(`wrote ${output}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
