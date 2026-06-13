import assert from "node:assert/strict";
import {
  validateDag,
  topologicalLevels,
  readyNodes,
  type PlannedNode,
} from "./dag";

function node(
  id: string,
  depends_on: string[] = [],
): PlannedNode {
  return { id, description: `node ${id}`, depends_on };
}

// cycle rejected
{
  const result = validateDag([
    node("a", ["b"]),
    node("b", ["a"]),
  ]);
  assert.equal(result.ok, false, "cycle should be rejected");
  if (!result.ok) assert.match(result.error, /cycle/i);
}

// dangling dep rejected
{
  const result = validateDag([node("a"), node("b", ["ghost"])]);
  assert.equal(result.ok, false, "dangling dep should be rejected");
  if (!result.ok) assert.match(result.error, /unknown node/i);
}

// self-dependency rejected
{
  const result = validateDag([node("a", ["a"])]);
  assert.equal(result.ok, false, "self-dependency should be rejected");
  if (!result.ok) assert.match(result.error, /itself/i);
}

// >8 nodes rejected
{
  const tooMany = Array.from({ length: 9 }, (_, i) => node(`n${i}`));
  const result = validateDag(tooMany);
  assert.equal(result.ok, false, ">8 nodes should be rejected");
  if (!result.ok) assert.match(result.error, /at most 8/i);
}

// a valid diamond DAG passes validation
const diamond: PlannedNode[] = [
  node("a"),
  node("b", ["a"]),
  node("c", ["a"]),
  node("d", ["b", "c"]),
];
assert.deepEqual(validateDag(diamond), { ok: true }, "diamond DAG must validate");

// diamond DAG topological levels: [["a"],["b","c"],["d"]]
assert.deepEqual(
  topologicalLevels(diamond),
  [["a"], ["b", "c"], ["d"]],
  "diamond topological levels mismatch",
);

// readyNodes: d unlocks only when both b and c are complete
{
  // initial: only a is ready
  assert.deepEqual(
    readyNodes(diamond, {
      a: "pending",
      b: "pending",
      c: "pending",
      d: "pending",
    }),
    ["a"],
    "only a should be ready initially",
  );

  // a complete -> b and c ready, d still locked
  assert.deepEqual(
    readyNodes(diamond, {
      a: "complete",
      b: "pending",
      c: "pending",
      d: "pending",
    }),
    ["b", "c"],
    "b and c should be ready after a completes",
  );

  // only b complete -> d still locked
  assert.deepEqual(
    readyNodes(diamond, {
      a: "complete",
      b: "complete",
      c: "executing",
      d: "pending",
    }),
    [],
    "d must stay locked until both b and c complete",
  );

  // both b and c complete -> d unlocks
  assert.deepEqual(
    readyNodes(diamond, {
      a: "complete",
      b: "complete",
      c: "complete",
      d: "pending",
    }),
    ["d"],
    "d should unlock when both b and c are complete",
  );
}

console.log("dag tests passed");
