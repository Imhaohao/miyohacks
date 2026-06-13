// Pure DAG helpers for the Arbor hive-mind planner. No Convex imports — this
// module is runtime-agnostic so it can be unit-tested and reused on the client.

export interface PlannedNode {
  id: string;
  description: string;
  depends_on: string[];
  success_criteria?: string;
  task_class?: "reasoning" | "classification" | "extraction" | "generation";
}

const NODE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

/**
 * Validate a planned DAG before it is persisted. Returns the first violation
 * found with a human-readable message. Rules:
 *  - 1..8 nodes
 *  - ids match NODE_ID_RE and are unique
 *  - every depends_on entry references an existing id and never the node itself
 *  - the graph is acyclic (Kahn's algorithm)
 *  - at least one node has no dependencies (a valid entry point)
 */
export function validateDag(
  nodes: PlannedNode[],
): { ok: true } | { ok: false; error: string } {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { ok: false, error: "DAG must contain at least 1 node" };
  }
  if (nodes.length > 8) {
    return {
      ok: false,
      error: `DAG must contain at most 8 nodes, got ${nodes.length}`,
    };
  }

  const seen = new Set<string>();
  for (const node of nodes) {
    if (!NODE_ID_RE.test(node.id)) {
      return {
        ok: false,
        error: `Invalid node id "${node.id}": must match /^[a-z0-9][a-z0-9_-]{0,30}$/`,
      };
    }
    if (seen.has(node.id)) {
      return { ok: false, error: `Duplicate node id "${node.id}"` };
    }
    seen.add(node.id);
  }

  for (const node of nodes) {
    for (const dep of node.depends_on) {
      if (dep === node.id) {
        return {
          ok: false,
          error: `Node "${node.id}" cannot depend on itself`,
        };
      }
      if (!seen.has(dep)) {
        return {
          ok: false,
          error: `Node "${node.id}" depends on unknown node "${dep}"`,
        };
      }
    }
  }

  // Kahn's algorithm: if we cannot remove every node, a cycle exists. This
  // runs before the "has a root" check because a graph with no root is itself
  // cyclic, and a cycle is the more specific, actionable diagnosis.
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    indegree.set(node.id, node.depends_on.length);
  }
  for (const node of nodes) {
    for (const dep of node.depends_on) {
      const list = dependents.get(dep) ?? [];
      list.push(node.id);
      dependents.set(dep, list);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }

  let removed = 0;
  while (queue.length > 0) {
    const id = queue.shift() as string;
    removed += 1;
    for (const child of dependents.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  if (removed !== nodes.length) {
    return { ok: false, error: "DAG contains a cycle" };
  }

  // An acyclic graph always has at least one zero-indegree node, so this is a
  // belt-and-suspenders guarantee of the spec's "at least one root" rule.
  const hasRoot = nodes.some((n) => n.depends_on.length === 0);
  if (!hasRoot) {
    return {
      ok: false,
      error: "DAG must have at least one node with no dependencies",
    };
  }

  return { ok: true };
}

/**
 * Group node ids into topological levels. Level 0 holds nodes with no deps;
 * level N holds nodes whose deps all resolved in earlier levels. Assumes the
 * input is already valid (call validateDag first).
 */
export function topologicalLevels(nodes: PlannedNode[]): string[][] {
  const byId = new Map<string, PlannedNode>();
  for (const node of nodes) byId.set(node.id, node);

  const placed = new Set<string>();
  const levels: string[][] = [];

  while (placed.size < nodes.length) {
    const level: string[] = [];
    for (const node of nodes) {
      if (placed.has(node.id)) continue;
      if (node.depends_on.every((dep) => placed.has(dep))) {
        level.push(node.id);
      }
    }
    // Guard against malformed input that would otherwise loop forever.
    if (level.length === 0) break;
    for (const id of level) placed.add(id);
    levels.push(level);
  }

  return levels;
}

/**
 * Return ids of nodes that are runnable right now: their own status is
 * "pending" and every dependency's status is "complete".
 */
export function readyNodes(
  nodes: PlannedNode[],
  statusByNodeId: Record<string, string>,
): string[] {
  const ready: string[] = [];
  for (const node of nodes) {
    if (statusByNodeId[node.id] !== "pending") continue;
    const depsComplete = node.depends_on.every(
      (dep) => statusByNodeId[dep] === "complete",
    );
    if (depsComplete) ready.push(node.id);
  }
  return ready;
}
