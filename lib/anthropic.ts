import { parseJSONLoose } from "./openai";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const CLAUDE_PLANNER_MODEL = "claude-fable-5";
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5-20251001";

export interface ClaudeCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
}

interface AnthropicTextResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface RequiredClaudeCallOptions extends Required<ClaudeCallOptions> {}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envFlag(name: string): boolean {
  const value = (env(name) ?? "").toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

function anthropicApiKey(): string {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return key;
}

function assertModelSpendEnabled(): void {
  if (envFlag("ARBOR_MODEL_SPEND_DISABLED")) {
    throw new Error(
      "remote model calls are switched off by ARBOR_MODEL_SPEND_DISABLED=true",
    );
  }
}

function extractText(data: AnthropicTextResponse): string {
  const text = data.content
    ?.filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
  if (text && text.trim()) return text;
  throw new Error("Anthropic returned no text content");
}

async function postClaudeMessage(opts: RequiredClaudeCallOptions): Promise<string> {
  const response = await withTimeout(
    fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey(),
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: opts.userPrompt }],
      }),
    }),
    opts.timeoutMs,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 300)}`);
  }

  return extractText((await response.json()) as AnthropicTextResponse);
}

export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const {
    model,
    systemPrompt,
    userPrompt,
    maxTokens = 1024,
    timeoutMs = 30_000,
    retries = 1,
  } = opts;

  const resolved: RequiredClaudeCallOptions = {
    model,
    systemPrompt,
    userPrompt,
    maxTokens,
    timeoutMs,
    retries,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      assertModelSpendEnabled();
      return await postClaudeMessage(resolved);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Anthropic call failed");
}

export async function callClaudeJSON<T>(opts: ClaudeCallOptions): Promise<T> {
  const text = await callClaude(opts);
  return parseJSONLoose<T>(text);
}
