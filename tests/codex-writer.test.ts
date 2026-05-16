import assert from "node:assert/strict";
import test from "node:test";
import { codexWriter } from "../lib/specialists/codex-writer";

const CODEX_ENV_KEYS = [
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
] as const;

async function withCodexEnv<T>(
  env: Partial<Record<(typeof CODEX_ENV_KEYS)[number], string>>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of CODEX_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("codex-writer declines implementation tasks without GitHub/OpenAI creds", async () => {
  await withCodexEnv({}, async () => {
    const decision = await codexWriter.bid(
      "Fix the repo bug and update the React task view.",
      "implementation",
    );

    assert.equal("decline" in decision && decision.decline, true);
    assert.match(
      "reason" in decision ? decision.reason : "",
      /GITHUB_TOKEN.*OPENAI_API_KEY/,
    );
  });
});

test("codex-writer bids only when GitHub and OpenAI are configured", async () => {
  await withCodexEnv(
    { GITHUB_TOKEN: "ghp_test", OPENAI_API_KEY: "sk-test" },
    async () => {
      const decision = await codexWriter.bid(
        "Implement the dashboard API integration in this repo.",
        "implementation",
      );

      if ("decline" in decision) {
        assert.fail(`expected a bid, got decline: ${decision.reason}`);
      }
      assert.equal(decision.tool_availability?.status, "available");
      assert.deepEqual(decision.tool_availability?.checked, [
        "GITHUB_TOKEN",
        "OPENAI_API_KEY",
      ]);
      assert.match(decision.capability_claim, /GitHub PR/);
      assert.match(decision.execution_preview ?? "", /Real repo-editing run/);
    },
  );
});
