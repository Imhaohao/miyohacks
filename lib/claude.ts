import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-20250514";

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

interface CallOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

export async function callClaude(opts: CallOptions): Promise<string> {
  const {
    systemPrompt,
    userPrompt,
    maxTokens = 1024,
    timeoutMs = 20_000,
    retries = 1,
  } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await withTimeout(
        client().messages.create({
          model: MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
        timeoutMs,
      );
      const block = res.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        throw new Error("Claude returned no text block");
      }
      return block.text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Claude call failed");
}

/**
 * Call Claude and parse the response as JSON. Tries to extract a JSON object
 * from the response even if Claude wraps it in prose or fences.
 */
export async function callClaudeJSON<T>(opts: CallOptions): Promise<T> {
  const text = await callClaude(opts);
  return parseJSONLoose<T>(text);
}

export function parseJSONLoose<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through to extraction
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    return JSON.parse(fence[1]) as T;
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1)) as T;
  }
  throw new Error(`Could not parse JSON from Claude response: ${trimmed.slice(0, 200)}`);
}
