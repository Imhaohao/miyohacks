const MODEL = "gpt-5.5";
const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

interface CallOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
}

interface OpenAITextResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

function extractText(data: OpenAITextResponse): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  throw new Error("OpenAI returned no text content");
}

export async function callOpenAI(opts: CallOptions): Promise<string> {
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
      const response = await withTimeout(
        fetch(CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey()}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_completion_tokens: maxTokens,
            // gpt-5.5 spends completion tokens on internal reasoning by default;
            // "minimal" keeps tokens going to the visible answer so bid JSON and
            // execute markdown are non-empty within our caps.
            reasoning_effort: "none",
          }),
        }),
        timeoutMs,
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${text.slice(0, 300)}`);
      }

      return extractText((await response.json()) as OpenAITextResponse);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("OpenAI call failed");
}

/**
 * Call OpenAI and parse the response as JSON. Tries to extract a JSON object
 * from the response even if the model wraps it in prose or fences.
 */
export async function callOpenAIJSON<T>(opts: CallOptions): Promise<T> {
  const text = await callOpenAI(opts);
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
  const extracted = extractBalancedJson(trimmed);
  if (extracted) {
    return JSON.parse(extracted) as T;
  }
  throw new Error(`Could not parse JSON from OpenAI response: ${trimmed.slice(0, 200)}`);
}

function extractBalancedJson(text: string): string | null {
  const start = text.search(/[\[{]/);
  if (start === -1) return null;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
