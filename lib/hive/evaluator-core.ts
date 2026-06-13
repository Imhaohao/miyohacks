export interface NodeEvaluation {
  node_id: string;
  agent_id: string;
  score: number;
  verdict: "accept" | "reject";
  reasoning: string;
  conflicts_with?: string[];
}

export interface EvaluatorResult {
  node_evaluations: NodeEvaluation[];
  conflicts: Array<{ node_a: string; node_b: string; explanation: string }>;
  final_answer: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

export function detectTies(
  items: Array<{ node_id: string; score: number; conflicts_with?: string[] }>,
  epsilon = 0.05,
): Array<[string, string]> {
  const byNode = new Map(items.map((item) => [item.node_id, item]));
  const seen = new Set<string>();
  const ties: Array<[string, string]> = [];

  for (const item of items) {
    for (const otherId of item.conflicts_with ?? []) {
      const other = byNode.get(otherId);
      if (!other) continue;
      const key = pairKey(item.node_id, otherId);
      if (seen.has(key)) continue;
      seen.add(key);
      if (Math.abs(clamp01(item.score) - clamp01(other.score)) <= epsilon) {
        ties.push(
          item.node_id < otherId
            ? [item.node_id, otherId]
            : [otherId, item.node_id],
        );
      }
    }
  }

  return ties;
}

export function overallConfidence(
  evaluations: Array<{ score: number; verdict: string }>,
): number {
  const accepted = evaluations.filter((ev) => ev.verdict === "accept");
  if (accepted.length === 0) return 0;
  const sum = accepted.reduce((acc, ev) => acc + clamp01(ev.score), 0);
  return sum / accepted.length;
}

export function parseEvaluatorResponse(
  raw: unknown,
): EvaluatorResult | { error: string } {
  if (!isRecord(raw)) return { error: "response must be an object" };
  if (!Array.isArray(raw.node_evaluations)) {
    return { error: "node_evaluations must be an array" };
  }
  if (!Array.isArray(raw.conflicts)) {
    return { error: "conflicts must be an array" };
  }
  if (typeof raw.final_answer !== "string" || !raw.final_answer.trim()) {
    return { error: "final_answer must be a non-empty string" };
  }

  const node_evaluations: NodeEvaluation[] = [];
  for (const [index, value] of raw.node_evaluations.entries()) {
    if (!isRecord(value)) {
      return { error: `node_evaluations[${index}] must be an object` };
    }
    const node_id = value.node_id;
    const agent_id = value.agent_id;
    const score = value.score;
    const verdict = value.verdict;
    const reasoning = value.reasoning;
    if (typeof node_id !== "string" || !node_id.trim()) {
      return { error: `node_evaluations[${index}].node_id is required` };
    }
    if (typeof agent_id !== "string" || !agent_id.trim()) {
      return { error: `node_evaluations[${index}].agent_id is required` };
    }
    if (typeof score !== "number" || !Number.isFinite(score)) {
      return { error: `node_evaluations[${index}].score must be a number` };
    }
    if (verdict !== "accept" && verdict !== "reject") {
      return {
        error: `node_evaluations[${index}].verdict must be accept or reject`,
      };
    }
    if (typeof reasoning !== "string") {
      return { error: `node_evaluations[${index}].reasoning is required` };
    }

    const conflicts_with =
      Array.isArray(value.conflicts_with) &&
      value.conflicts_with.every((item) => typeof item === "string")
        ? value.conflicts_with
        : undefined;

    node_evaluations.push({
      node_id: node_id.trim(),
      agent_id: agent_id.trim(),
      score: clamp01(score),
      verdict,
      reasoning,
      conflicts_with,
    });
  }

  const conflicts: EvaluatorResult["conflicts"] = [];
  for (const [index, value] of raw.conflicts.entries()) {
    if (!isRecord(value)) {
      return { error: `conflicts[${index}] must be an object` };
    }
    const node_a = value.node_a;
    const node_b = value.node_b;
    const explanation = value.explanation;
    if (typeof node_a !== "string" || !node_a.trim()) {
      return { error: `conflicts[${index}].node_a is required` };
    }
    if (typeof node_b !== "string" || !node_b.trim()) {
      return { error: `conflicts[${index}].node_b is required` };
    }
    if (typeof explanation !== "string") {
      return { error: `conflicts[${index}].explanation is required` };
    }
    conflicts.push({
      node_a: node_a.trim(),
      node_b: node_b.trim(),
      explanation,
    });
  }

  return {
    node_evaluations,
    conflicts,
    final_answer: raw.final_answer.trim(),
  };
}
