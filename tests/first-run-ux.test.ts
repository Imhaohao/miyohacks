import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const signedOutComposer = readFileSync(
  "components/SignedOutTaskComposer.tsx",
  "utf8",
);
const taskForm = readFileSync("components/PostTaskForm.tsx", "utf8");
const agentsPage = readFileSync("app/agents/page.tsx", "utf8");
const specialistsApi = readFileSync("app/api/v1/specialists/route.ts", "utf8");
const readPublicCopy = (path: string) => readFileSync(path, "utf8");

test("home page uses protocol-first positioning and hides public admin nav", () => {
  assert.match(page, /MCP-first agent auction protocol/);
  assert.match(page, /Let agents discover, price, judge, and pay other agents/);
  assert.doesNotMatch(page, /href="\/admin"/);
});

test("home page includes a plain-language first-run task timeline", () => {
  for (const label of [
    "Context",
    "Specialists",
    "Proposal",
    "Approval",
    "Delivery",
    "Payment",
  ]) {
    assert.match(page, new RegExp(`"${label}"`));
  }
});

test("signed-out task composer is usable before sign-in", () => {
  assert.match(signedOutComposer, /<textarea/);
  assert.match(signedOutComposer, /Preview is free/);
  assert.match(signedOutComposer, /AgentSuggestions/);
  assert.doesNotMatch(signedOutComposer, /disabled/);
});

test("context labels use product language instead of vendor names", () => {
  assert.match(taskForm, /Company context/);
  assert.match(taskForm, /Repo\/source context/);
  assert.doesNotMatch(taskForm, /Hyperspell business memory/);
  assert.doesNotMatch(taskForm, /Nia\/GitHub repo context/);
});

test("agent registry surfaces execution status and mock counts", () => {
  assert.match(agentsPage, /EXECUTION_STATUS_LABELS/);
  assert.match(agentsPage, /mock_unconnected/);
  assert.match(specialistsApi, /execution_status_counts/);
});

test("public auction copy matches score-ranked clearing behavior", () => {
  const publicCopy = [
    "README.md",
    "docs/protocol-thesis-checklist.md",
    "app/api/openapi.json/route.ts",
    "app/api/v1/route.ts",
    "components/task/AuctionResolution.tsx",
    "lib/mcp-tools.ts",
    "lib/specialists/base.ts",
    "lib/specialists/mcp-forwarding.ts",
    "packages/vercel-ai/src/index.ts",
    "packages/langchain/src/index.ts",
    "packages/mastra/src/index.ts",
    "examples/mcp-client.ts",
  ]
    .map(readPublicCopy)
    .join("\n");

  assert.doesNotMatch(
    publicCopy,
    /quality-adjusted|second-highest|second highest|runner-up value|value benchmark|expected quality per effective price/i,
  );
  assert.match(readPublicCopy("README.md"), /reputation_score \/ bid_price/);
  assert.match(readPublicCopy("README.md"), /next-best eligible executor's raw `bid_price`/);
  assert.match(
    readPublicCopy("app/api/openapi.json/route.ts"),
    /prices from the next-best eligible executor's raw bid/,
  );
});
