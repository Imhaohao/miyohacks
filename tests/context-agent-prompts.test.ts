import assert from "node:assert/strict";
import { test } from "node:test";
import { HYPERSPELL_BRAIN_CONFIG } from "../lib/specialists/hyperspell-brain";
import { NIA_CONTEXT_CONFIG } from "../lib/specialists/nia-context";
import { buildNiaResearchQuery } from "../lib/nia-loader";

test("Nia context agent indexes GitHub and reads the README before asking for context", () => {
  const prompt = NIA_CONTEXT_CONFIG.system_prompt;

  assert.match(prompt, /GitHub repository/);
  assert.match(prompt, /README\.md/);
  assert.match(prompt, /before asking the user for more context/);
});

test("Hyperspell context agent coordinates with Nia for GitHub README bootstrap", () => {
  const prompt = HYPERSPELL_BRAIN_CONFIG.system_prompt;

  assert.match(prompt, /Nia\/GitHub context layer/);
  assert.match(prompt, /indexed through GitHub/);
  assert.match(prompt, /README-derived product purpose/);
});

test("live Nia enrichment query asks for GitHub and README context", () => {
  const query = buildNiaResearchQuery(
    "Use https://github.com/acme/widget to build onboarding",
    "implementation",
  );

  assert.match(query, /index or search that GitHub repository first/);
  assert.match(query, /README\.md/);
  assert.match(query, /Ask the user only for context gaps/);
});
