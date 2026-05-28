import assert from "node:assert/strict";
import {
  buildFallbackFinalPrompt,
  normalizeIntakeModelResult,
} from "./intake-normalize";

assert.deepEqual(
  normalizeIntakeModelResult({
    status: "questions",
    questions: ["Goal?", "Constraints?", "Goal?", ""],
  }),
  { status: "questions", questions: ["Goal?", "Constraints?"] },
);

assert.deepEqual(
  normalizeIntakeModelResult({
    status: "ready",
    final_prompt: "Build the intake flow.",
  }),
  { status: "ready", final_prompt: "Build the intake flow." },
);

assert.equal(normalizeIntakeModelResult({ status: "questions", questions: [] }), null);

assert.equal(
  buildFallbackFinalPrompt("Do the thing", ["Use Convex", "Keep APIs stable"]),
  "Do the thing\n\nUser-provided clarification:\n\nUse Convex\n\nKeep APIs stable",
);

console.log("intake-normalize tests passed");
