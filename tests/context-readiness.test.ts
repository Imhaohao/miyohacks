import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSoftwareEngineeringTask,
  requiredContextForPrompt,
} from "../lib/context-readiness";

test("software, debug, build, and integration prompts require repo context", () => {
  const prompts = [
    "Debug this Next.js checkout bug",
    "Build a Convex API for the dashboard",
    "Set up Stripe Connect in our repo",
    "Deploy the app and fix failing tests",
  ];

  for (const prompt of prompts) {
    assert.equal(isSoftwareEngineeringTask(prompt), true);
    assert.deepEqual(requiredContextForPrompt(prompt), ["hyperspell", "nia_repo"]);
  }
});

test("general business tasks require business memory only", () => {
  const prompts = [
    "Plan a launch announcement",
    "Research our customer positioning",
    "Draft creator outreach copy",
  ];

  for (const prompt of prompts) {
    assert.equal(isSoftwareEngineeringTask(prompt), false);
    assert.deepEqual(requiredContextForPrompt(prompt), ["hyperspell"]);
  }
});
