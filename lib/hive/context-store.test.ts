import assert from "node:assert/strict";
import { assembleNodeContext, formatEntriesForPrompt } from "./context-store";

function run() {
  // Empty input returns "".
  assert.equal(formatEntriesForPrompt([]), "");

  // Newest-LAST ordering: input is out of order, output must be ascending by
  // created_at (oldest line first, newest line last).
  const ordered = formatEntriesForPrompt([
    { agent_id: "b", kind: "result", confidence: 0.5, content: "second", created_at: 200 },
    { agent_id: "a", kind: "observation", confidence: 0.9, content: "first", created_at: 100 },
    { agent_id: "c", kind: "decision", confidence: 0.1, content: "third", created_at: 300 },
  ]);
  const lines = ordered.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes("first"), "oldest entry first");
  assert.ok(lines[1].includes("second"), "middle entry second");
  assert.ok(lines[2].includes("third"), "newest entry last");

  // Confidence formatted to exactly 2 decimals.
  const conf = formatEntriesForPrompt([
    { agent_id: "x", kind: "result", confidence: 0.333333, content: "c", created_at: 1 },
  ]);
  assert.equal(conf, "- [result by x, confidence 0.33] c");
  const confInt = formatEntriesForPrompt([
    { agent_id: "x", kind: "result", confidence: 1, content: "c", created_at: 1 },
  ]);
  assert.equal(confInt, "- [result by x, confidence 1.00] c");

  // Content truncated to 500 chars.
  const long = "y".repeat(900);
  const truncated = formatEntriesForPrompt([
    { agent_id: "x", kind: "observation", confidence: 0.5, content: long, created_at: 1 },
  ]);
  const renderedContent = truncated.slice(truncated.indexOf("] ") + 2);
  assert.equal(renderedContent.length, 500, "content truncated to 500 chars");

  // Drops OLDEST entries first to respect maxChars.
  const entries = Array.from({ length: 10 }, (_, i) => ({
    agent_id: "agent",
    kind: "observation",
    confidence: 0.5,
    content: `entry-${i}`,
    created_at: i,
  }));
  // One line is "- [observation by agent, confidence 0.50] entry-N" (~49 chars).
  // Cap at ~120 chars so only the 2 newest survive.
  const clamped = formatEntriesForPrompt(entries, 120);
  assert.ok(clamped.length <= 120, "output within maxChars");
  assert.ok(clamped.includes("entry-9"), "newest entry retained");
  assert.ok(clamped.includes("entry-8"), "second-newest entry retained");
  assert.ok(!clamped.includes("entry-0"), "oldest entry dropped");
  assert.ok(!clamped.includes("entry-7"), "older entries dropped to fit");

  // assembleNodeContext: empty + empty returns "".
  assert.equal(
    assembleNodeContext({ dependencyEntries: [], recallEntries: [] }),
    "",
  );

  // Dependency entries appear before recall entries in the output. Because
  // formatEntriesForPrompt sorts by created_at, give deps a LATER timestamp so
  // they render last; with mixed timestamps we instead assert membership +
  // relative position using distinct content markers and created_at ordering.
  const assembled = assembleNodeContext({
    dependencyEntries: [
      {
        entry_id: "dep1",
        agent_id: "depAgent",
        kind: "result",
        confidence: 0.9,
        content: "DEPENDENCY_OUTPUT",
        created_at: 100,
      },
    ],
    recallEntries: [
      {
        entry_id: "rec1",
        agent_id: "recAgent",
        kind: "observation",
        confidence: 0.4,
        content: "RECALL_HIT",
        created_at: 50,
      },
    ],
  });
  // Both present.
  assert.ok(assembled.includes("DEPENDENCY_OUTPUT"), "dependency entry present");
  assert.ok(assembled.includes("RECALL_HIT"), "recall entry present");
  // Dependency merged FIRST in input order — its created_at (100) is newer than
  // the recall entry (50), so newest-last rendering puts the dependency line
  // after the recall line. Verify the dependency line is the final line.
  const assembledLines = assembled.split("\n");
  assert.ok(
    assembledLines[assembledLines.length - 1].includes("DEPENDENCY_OUTPUT"),
    "dependency line rendered (newest-last)",
  );

  // De-duplicate by entry_id: an id present in both lists appears once.
  const deduped = assembleNodeContext({
    dependencyEntries: [
      {
        entry_id: "shared",
        agent_id: "a",
        kind: "result",
        confidence: 1,
        content: "ONLY_ONCE",
        created_at: 10,
      },
    ],
    recallEntries: [
      {
        entry_id: "shared",
        agent_id: "a",
        kind: "result",
        confidence: 1,
        content: "ONLY_ONCE",
        created_at: 10,
      },
    ],
  });
  const occurrences = deduped.split("\n").filter((l) => l.includes("ONLY_ONCE"));
  assert.equal(occurrences.length, 1, "shared entry_id de-duplicated to one line");

  console.log("context-store tests passed");
}

try {
  run();
} catch (err) {
  console.error("context-store tests failed:", err);
  process.exit(1);
}
