import assert from "node:assert/strict";
import {
  detectTies,
  overallConfidence,
  parseEvaluatorResponse,
} from "./evaluator-core";

assert.deepEqual(
  detectTies([
    { node_id: "a", score: 0.8, conflicts_with: ["b"] },
    { node_id: "b", score: 0.76, conflicts_with: ["a"] },
  ]),
  [["a", "b"]],
  "4%-apart conflicting scores should be a tie",
);

assert.deepEqual(
  detectTies([
    { node_id: "a", score: 0.8, conflicts_with: ["b"] },
    { node_id: "b", score: 0.74, conflicts_with: ["a"] },
  ]),
  [],
  "6%-apart conflicting scores should not be a tie",
);

assert.equal(
  overallConfidence([
    { score: 0.9, verdict: "accept" },
    { score: 0.1, verdict: "reject" },
    { score: 0.7, verdict: "accept" },
  ]),
  0.8,
  "confidence should average accepted nodes only",
);

const parsed = parseEvaluatorResponse({
  node_evaluations: [
    {
      node_id: "a",
      agent_id: "agent-a",
      score: 1.2,
      verdict: "accept",
      reasoning: "strong",
    },
  ],
  conflicts: [{ node_a: "a", node_b: "b", explanation: "different claims" }],
  final_answer: " Final answer ",
});

assert.equal("error" in parsed, false, "valid response should parse");
if (!("error" in parsed)) {
  assert.equal(parsed.node_evaluations[0].score, 1, "score should clamp");
  assert.equal(parsed.final_answer, "Final answer");
}

const invalid = parseEvaluatorResponse({ node_evaluations: [] });
assert.equal("error" in invalid, true, "invalid response should return error");

console.log("evaluator-core tests passed");
