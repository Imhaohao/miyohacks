// Hive-mind Layer 4 shared context store: pure types + prompt formatting.
// NO Convex imports — this module is safe to import from anywhere (Convex
// runtime, Node actions, browser, tests). The actual reads/writes live in
// convex/scratchpad.ts and convex/scratchpadActions.ts.

export interface ScratchpadWrite {
  dag_id: string;
  node_id?: string;
  task_id?: string;
  agent_id: string;
  kind: "observation" | "result" | "decision" | "question";
  content: string;
  confidence: number;
}

export interface ScratchpadEntry extends ScratchpadWrite {
  entry_id: string;
  created_at: number;
  embedding_model?: string;
}

const MAX_CONTENT_CHARS = 500;

/**
 * Render scratchpad entries as a newline-delimited prompt block.
 *
 * - Ordering is newest-LAST (entries are sorted ascending by created_at), so
 *   the most recent context sits closest to the model's generation point.
 * - Each line: "- [<kind> by <agent_id>, confidence <X.XX>] <content>" where
 *   content is truncated to 500 chars and confidence is fixed to 2 decimals.
 * - Total output is clamped to `maxChars` by dropping the OLDEST entries first.
 * - Returns "" for empty input.
 */
export function formatEntriesForPrompt(
  entries: Array<{
    agent_id: string;
    kind: string;
    confidence: number;
    content: string;
    created_at: number;
  }>,
  maxChars = 4000,
): string {
  if (entries.length === 0) return "";

  // Newest-last ordering.
  const sorted = [...entries].sort((a, b) => a.created_at - b.created_at);

  const lines = sorted.map((e) => {
    const content =
      e.content.length > MAX_CONTENT_CHARS
        ? e.content.slice(0, MAX_CONTENT_CHARS)
        : e.content;
    const confidence = e.confidence.toFixed(2);
    return `- [${e.kind} by ${e.agent_id}, confidence ${confidence}] ${content}`;
  });

  // Drop oldest lines (front of the array) until the joined block fits.
  let start = 0;
  while (start < lines.length) {
    const candidate = lines.slice(start).join("\n");
    if (candidate.length <= maxChars) return candidate;
    start += 1;
  }

  // Every individual line exceeds maxChars; return the newest one anyway so the
  // caller still gets the latest context rather than an empty string.
  return lines[lines.length - 1];
}

interface ContextEntry {
  entry_id?: string;
  agent_id: string;
  kind: string;
  confidence: number;
  content: string;
  created_at: number;
}

/**
 * Merge dependency-output entries and semantic-recall entries into a single
 * prompt block for a node's child agent.
 *
 * - Dependency entries ALWAYS come first, then recall entries.
 * - De-duplicated by `entry_id`, keeping the first occurrence (so a recall
 *   entry that re-surfaces a dependency entry is dropped). Entries that lack an
 *   `entry_id` are never deduped against each other.
 * - Empty + empty returns "".
 * - The char budget is applied by delegating the merged, ordered list to
 *   formatEntriesForPrompt (which drops OLDEST entries first to fit).
 */
export function assembleNodeContext(args: {
  dependencyEntries: ContextEntry[];
  recallEntries: ContextEntry[];
  maxChars?: number;
}): string {
  const merged = [...args.dependencyEntries, ...args.recallEntries];
  if (merged.length === 0) return "";

  const seen = new Set<string>();
  const deduped: ContextEntry[] = [];
  for (const entry of merged) {
    if (entry.entry_id !== undefined) {
      if (seen.has(entry.entry_id)) continue;
      seen.add(entry.entry_id);
    }
    deduped.push(entry);
  }

  return formatEntriesForPrompt(deduped, args.maxChars ?? 4000);
}
