import assert from "node:assert/strict";
import test from "node:test";
import { codexRunnerConfigured } from "../lib/codex-runner";
import { codexWriter } from "../lib/specialists/codex-writer";

const CODEX_ENV_KEYS = [
  "CODEX_RUNNER_URL",
  "CODEX_WORKSPACE_DIR",
  "CODEX_RUNNER_SECRET",
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

test("codex-writer declines implementation tasks without a real runner", async () => {
  await withCodexEnv({}, async () => {
    assert.equal(codexRunnerConfigured(), false);

    const decision = await codexWriter.bid(
      "Fix the repo bug and update the React task view.",
      "implementation",
    );

    assert.equal("decline" in decision && decision.decline, true);
    assert.match(
      "reason" in decision ? decision.reason : "",
      /Real Codex execution is not configured/,
    );
  });
});

test("codex-writer bids only when a real runner is configured", async () => {
  await withCodexEnv(
    { CODEX_RUNNER_URL: "https://runner.example.test/api/codex/run" },
    async () => {
      assert.equal(codexRunnerConfigured(), true);

      const decision = await codexWriter.bid(
        "Implement the dashboard API integration in this repo.",
        "implementation",
      );

      if ("decline" in decision) {
        assert.fail(`expected a bid, got decline: ${decision.reason}`);
      }
      assert.equal(decision.tool_availability?.status, "available");
      assert.deepEqual(decision.tool_availability?.checked, ["CODEX_RUNNER_URL"]);
      assert.match(decision.capability_claim, /remote Codex runner/);
      assert.match(decision.execution_preview ?? "", /Real repo-editing run/);
    },
  );
});
