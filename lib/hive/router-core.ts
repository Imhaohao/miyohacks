// Hive router pure helpers (Layer 5). No Convex, no I/O — just deterministic
// string/number functions used by convex/hiveRouter.ts and exercised directly
// in router-core.test.ts.

const ROUTING_QUERY_MAX_CHARS = 1500;
const MAX_HINT_LINES = 3;

/**
 * Build the semantic-search query string for routing a single DAG node.
 * Layout: node description, then the success criteria line (if present), then
 * up to 3 scratchpad hint lines. The whole thing is clamped to 1500 chars so
 * it stays well inside embedding limits.
 */
export function buildRoutingQuery(
  node: { description: string; success_criteria?: string },
  scratchpadHints: string[],
): string {
  const lines: string[] = [node.description];
  if (node.success_criteria && node.success_criteria.trim()) {
    lines.push(`Success criteria: ${node.success_criteria.trim()}`);
  }
  for (const hint of scratchpadHints.slice(0, MAX_HINT_LINES)) {
    if (hint && hint.trim()) lines.push(hint.trim());
  }
  return lines.join("\n").slice(0, ROUTING_QUERY_MAX_CHARS);
}

/**
 * Even split of a DAG's budget across its nodes, rounded to cents. Guards
 * against a zero node count so the divisor is never 0.
 */
export function perNodeBudget(dagBudget: number, nodeCount: number): number {
  return Number((dagBudget / Math.max(1, nodeCount)).toFixed(2));
}

/**
 * Decide whether routing should fall back to an open auction (no invited
 * shortlist). True when the registry returned fewer than 2 candidates, or when
 * even the best match is too weak (similarity < 0.15) to trust as a shortlist.
 */
export function shouldFallbackOpen(
  candidates: Array<{ similarity: number }>,
): boolean {
  if (candidates.length < 2) return true;
  const best = Math.max(...candidates.map((c) => c.similarity));
  return best < 0.15;
}
