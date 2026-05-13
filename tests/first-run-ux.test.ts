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

test("home page uses the startup launch wedge and hides public admin nav", () => {
  assert.match(page, /Startup launch work, specialist-routed/);
  assert.match(page, /Launch tasks matched to the right AI specialist/);
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
