import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

type Role = "system" | "user" | "assistant";

interface FineTuneMessage {
  role: Role;
  content: string;
}

interface FineTuneExample {
  messages?: FineTuneMessage[];
}

interface FileReport {
  path: string;
  ok: boolean;
  examples: number;
  errors: string[];
  warnings: string[];
}

const DEFAULT_DIR = "data/fine-tuning";
const DEFAULT_FILES = [
  "arbor-suggester.train.jsonl",
  "arbor-suggester.validation.jsonl",
  "arbor-suggester.test.jsonl",
  "arbor-judge.train.jsonl",
  "arbor-judge.validation.jsonl",
  "arbor-judge.test.jsonl",
];
const MIN_TRAIN_EXAMPLES = 10;
const MIN_VALIDATION_EXAMPLES = 2;
const MIN_TEST_EXAMPLES = 2;

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function minExamplesFor(path: string): number {
  const name = basename(path);
  if (name.includes(".train.")) return MIN_TRAIN_EXAMPLES;
  if (name.includes(".validation.")) return MIN_VALIDATION_EXAMPLES;
  if (name.includes(".test.")) return MIN_TEST_EXAMPLES;
  return 1;
}

function parseAssistantJson(path: string, lineNo: number, content: string, report: FileReport): unknown {
  try {
    return JSON.parse(content);
  } catch (err) {
    report.errors.push(
      `${path}:${lineNo} assistant content must be JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

function validateSuggesterOutput(path: string, lineNo: number, content: string, report: FileReport): void {
  const parsed = parseAssistantJson(path, lineNo, content, report);
  if (!parsed || typeof parsed !== "object") return;
  const ranked = (parsed as { ranked?: unknown }).ranked;
  if (!Array.isArray(ranked) || ranked.length === 0) {
    report.errors.push(`${path}:${lineNo} suggester output must contain non-empty ranked[]`);
    return;
  }
  const seen = new Set<string>();
  for (const [index, item] of ranked.entries()) {
    if (!item || typeof item !== "object") {
      report.errors.push(`${path}:${lineNo} ranked[${index}] must be an object`);
      continue;
    }
    const row = item as {
      agent_id?: unknown;
      fit_score?: unknown;
      fit_reasoning?: unknown;
    };
    if (typeof row.agent_id !== "string" || !row.agent_id.trim()) {
      report.errors.push(`${path}:${lineNo} ranked[${index}].agent_id must be a non-empty string`);
    } else if (seen.has(row.agent_id)) {
      report.errors.push(`${path}:${lineNo} duplicate agent_id ${row.agent_id}`);
    } else {
      seen.add(row.agent_id);
    }
    if (
      typeof row.fit_score !== "number" ||
      !Number.isFinite(row.fit_score) ||
      row.fit_score < 0 ||
      row.fit_score > 1
    ) {
      report.errors.push(`${path}:${lineNo} ranked[${index}].fit_score must be a number in [0,1]`);
    }
    if (typeof row.fit_reasoning !== "string" || !row.fit_reasoning.trim()) {
      report.errors.push(`${path}:${lineNo} ranked[${index}].fit_reasoning must be a non-empty string`);
    }
  }
}

function validateJudgeOutput(path: string, lineNo: number, content: string, report: FileReport): void {
  const parsed = parseAssistantJson(path, lineNo, content, report);
  if (!parsed || typeof parsed !== "object") return;
  const row = parsed as {
    verdict?: unknown;
    reasoning?: unknown;
    quality_score?: unknown;
  };
  if (row.verdict !== "accept" && row.verdict !== "reject") {
    report.errors.push(`${path}:${lineNo} judge verdict must be accept or reject`);
  }
  if (typeof row.reasoning !== "string" || !row.reasoning.trim()) {
    report.errors.push(`${path}:${lineNo} judge reasoning must be a non-empty string`);
  }
  if (
    typeof row.quality_score !== "number" ||
    !Number.isFinite(row.quality_score) ||
    row.quality_score < 0 ||
    row.quality_score > 1
  ) {
    report.errors.push(`${path}:${lineNo} judge quality_score must be a number in [0,1]`);
  }
}

function validateExample(path: string, lineNo: number, example: FineTuneExample, report: FileReport): void {
  const messages = example.messages;
  if (!Array.isArray(messages) || messages.length < 2) {
    report.errors.push(`${path}:${lineNo} messages must contain at least user and assistant messages`);
    return;
  }

  let users = 0;
  let assistants = 0;
  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== "object") {
      report.errors.push(`${path}:${lineNo} messages[${index}] must be an object`);
      continue;
    }
    if (!["system", "user", "assistant"].includes(message.role)) {
      report.errors.push(`${path}:${lineNo} messages[${index}].role is invalid`);
    }
    if (typeof message.content !== "string" || !message.content.trim()) {
      report.errors.push(`${path}:${lineNo} messages[${index}].content must be non-empty`);
    }
    if (message.role === "user") users += 1;
    if (message.role === "assistant") assistants += 1;
  }

  if (users === 0) report.errors.push(`${path}:${lineNo} must contain at least one user message`);
  if (assistants === 0) report.errors.push(`${path}:${lineNo} must contain at least one assistant message`);
  if (messages[messages.length - 1]?.role !== "assistant") {
    report.errors.push(`${path}:${lineNo} last message must be assistant for SFT`);
  }
  const firstNonSystem = messages.find((message) => message.role !== "system");
  if (firstNonSystem?.role !== "user") {
    report.errors.push(`${path}:${lineNo} first non-system message must be user`);
  }

  const assistant = messages[messages.length - 1];
  if (!assistant || assistant.role !== "assistant") return;
  if (basename(path).includes("suggester")) {
    validateSuggesterOutput(path, lineNo, assistant.content, report);
  } else if (basename(path).includes("judge")) {
    validateJudgeOutput(path, lineNo, assistant.content, report);
  }
}

async function validateFile(path: string): Promise<FileReport> {
  const report: FileReport = {
    path,
    ok: true,
    examples: 0,
    errors: [],
    warnings: [],
  };
  if (!path.endsWith(".jsonl")) {
    report.errors.push(`${path} must use .jsonl extension`);
  }
  let raw = "";
  try {
    raw = stripBom(await readFile(path, "utf8"));
  } catch (err) {
    report.errors.push(`${path} could not be read: ${err instanceof Error ? err.message : String(err)}`);
    report.ok = false;
    return report;
  }
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  report.examples = lines.length;
  if (lines.length === 0) report.errors.push(`${path} has no examples`);
  const minExamples = minExamplesFor(path);
  if (lines.length < minExamples) {
    report.errors.push(
      `${path} has ${lines.length} examples; expected at least ${minExamples}`,
    );
  }

  const userPrompts = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const lineNo = index + 1;
    let parsed: FineTuneExample;
    try {
      parsed = JSON.parse(line) as FineTuneExample;
    } catch (err) {
      report.errors.push(
        `${path}:${lineNo} invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    validateExample(path, lineNo, parsed, report);
    const userPrompt = parsed.messages?.findLast((message) => message.role === "user")?.content;
    if (userPrompt) {
      if (userPrompts.has(userPrompt)) {
        report.warnings.push(`${path}:${lineNo} duplicate user prompt in file`);
      }
      userPrompts.add(userPrompt);
    }
  }

  report.ok = report.errors.length === 0;
  return report;
}

async function main(): Promise<void> {
  const dir = arg("dir", process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : DEFAULT_DIR);
  const output = arg("output", join(dir, "validation-report.json"));
  const files = DEFAULT_FILES.map((file) => join(dir, file));
  const reports = await Promise.all(files.map(validateFile));
  const totalExamples = reports.reduce((sum, report) => sum + report.examples, 0);
  const errors = reports.flatMap((report) => report.errors);
  const warnings = reports.flatMap((report) => report.warnings);
  const summary = {
    ok: errors.length === 0,
    generated_at: new Date().toISOString(),
    total_examples: totalExamples,
    files: reports,
    errors,
    warnings,
  };
  await writeFile(output, JSON.stringify(summary, null, 2) + "\n", "utf8");

  for (const report of reports) {
    console.log(
      `${report.ok ? "PASS" : "FAIL"} ${report.path} — ${report.examples} examples`,
    );
  }
  if (warnings.length > 0) {
    console.log(`WARN ${warnings.length} warning(s); see ${output}`);
  }
  if (errors.length > 0) {
    console.error(`FAIL ${errors.length} validation error(s); see ${output}`);
    process.exit(1);
  }
  console.log(`wrote ${output}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
