import assert from "node:assert/strict";
import { callClaude, callClaudeJSON, CLAUDE_FAST_MODEL } from "./anthropic";
import { parseJSONLoose } from "./openai";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ARBOR_MODEL_SPEND_DISABLED;
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  resetEnv();
  globalThis.fetch = ORIGINAL_FETCH;
  try {
    await fn();
    console.log(`ok - ${name}`);
  } finally {
    resetEnv();
    globalThis.fetch = ORIGINAL_FETCH;
  }
}

async function main(): Promise<void> {
  await test("callClaude throws fast when ANTHROPIC_API_KEY is unset", async () => {
    let calledFetch = false;
    globalThis.fetch = async () => {
      calledFetch = true;
      throw new Error("fetch should not be called");
    };

    await assert.rejects(
      () =>
        callClaude({
          model: CLAUDE_FAST_MODEL,
          systemPrompt: "Classify this.",
          userPrompt: "hello",
        }),
      /ANTHROPIC_API_KEY is not set/,
    );
    assert.equal(calledFetch, false);
  });

  await test("parseJSONLoose round-trips fenced JSON", () => {
    assert.deepEqual(
      parseJSONLoose<{ status: string; score: number }>(
        '```json\n{"status":"ok","score":1}\n```',
      ),
      { status: "ok", score: 1 },
    );
  });

  await test("callClaude constructs Anthropic request body and extracts JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    let request: { url: string; init?: RequestInit } | undefined;

    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: '```json\n{"route":"planner"}\n```' },
            { type: "tool_use", name: "ignored" },
            { type: "text", text: "" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callClaudeJSON<{ route: string }>({
      model: CLAUDE_FAST_MODEL,
      systemPrompt: "Route requests.",
      userPrompt: "Need a plan.",
      maxTokens: 321,
      timeoutMs: 1_000,
    });

    assert.deepEqual(result, { route: "planner" });
    assert.ok(request);
    assert.equal(request.url, "https://api.anthropic.com/v1/messages");
    assert.equal(request.init?.method, "POST");
    assert.deepEqual(request.init?.headers, {
      "x-api-key": "test-anthropic-key",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(String(request.init?.body)), {
      model: CLAUDE_FAST_MODEL,
      max_tokens: 321,
      system: "Route requests.",
      messages: [{ role: "user", content: "Need a plan." }],
    });
  });

  console.log("anthropic tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
