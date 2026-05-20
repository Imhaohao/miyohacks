import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  configuredLLMProvider,
  defaultLLMModel,
  llmProviderSummary,
} from "../lib/llm-provider";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("LLM provider story is OpenAI-based behind a protocol-neutral boundary", () => {
  assert.equal(configuredLLMProvider(), "openai");
  assert.equal(defaultLLMModel({ OPENAI_MODEL: undefined }), "gpt-5.5");
  assert.equal(defaultLLMModel({ OPENAI_MODEL: "gpt-test" }), "gpt-test");
  assert.match(llmProviderSummary(), /OpenAI/);

  assert.match(read("lib/openai.ts"), /defaultLLMModel/);
  assert.match(read("lib/specialists/mcp-forwarding.ts"), /defaultLLMModel/);
  assert.match(read("README.md"), /protocol is provider-neutral/i);
  assert.match(read("README.md"), /v0\s+implementation is explicitly \*\*OpenAI-based\*\*/);
  assert.match(read("docs/INFRASTRUCTURE.md"), /There is no active Anthropic\/Claude runtime/);
});

test("protocol escrow is distinct from optional Stripe funding and payout rails", () => {
  const publicCopy = [
    read("README.md"),
    read("docs/INFRASTRUCTURE.md"),
    read("app/billing/page.tsx"),
    read("components/BillingClient.tsx"),
    read("components/task/PaymentPanel.tsx"),
  ].join("\n");

  assert.match(publicCopy, /core protocol escrow is a simulated\/internal Convex credit ledger/i);
  assert.match(publicCopy, /Stripe Checkout and Connect are optional rails/i);
  assert.match(publicCopy, /payout readiness does not decide\s+whether an agent can execute/i);
  assert.match(publicCopy, /they do not gate\s+specialist execution/i);
  assert.doesNotMatch(publicCopy, /payout blocked/i);
});

test("human overrides are audited governance, not canonical reputation updates", () => {
  const disputes = read("convex/disputes.ts");
  const auctions = read("convex/auctions.ts");
  const types = read("lib/types.ts");
  const judgePanel = read("components/task/JudgeVerdictPanel.tsx");
  const checklist = read("docs/protocol-thesis-checklist.md");

  assert.match(types, /"dispute_raised"/);
  assert.match(types, /"judge_override"/);
  assert.match(disputes, /event_type: "dispute_raised"/);
  assert.match(disputes, /event_type: "judge_override"/);
  assert.match(disputes, /affects_reputation: false/);
  assert.match(disputes, /reputation_authority: "canonical_judge_only"/);
  assert.doesNotMatch(disputes, /_applyReputationDelta/);

  assert.match(auctions, /source: "llm_judge"/);
  assert.match(auctions, /affects_reputation: true/);
  assert.match(judgePanel, /judge is canonical for reputation/i);
  assert.match(judgePanel, /does not mutate\s+canonical reputation/i);
  assert.match(checklist, /canonical score changes flow through judge-derived settlement/i);
});
