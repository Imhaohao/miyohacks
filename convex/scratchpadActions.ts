"use node";

// Hive-mind Layer 4 shared context store: Node-runtime actions. These need the
// embeddings helper (network I/O) and ctx.vectorSearch (actions only). All DB
// access is delegated to the queries/mutations in convex/scratchpad.ts; the DAG
// existence check delegates to convex/hiveData.ts. No ctx.db here.

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { embedText, embeddingBackend } from "../lib/hive/embeddings";

const kindValidator = v.union(
  v.literal("observation"),
  v.literal("result"),
  v.literal("decision"),
  v.literal("question"),
);

const SEMANTIC_DEFAULT = 8;
const SEMANTIC_MAX = 20;

function modelLabel(): string {
  return embeddingBackend() === "openai"
    ? "openai:text-embedding-3-small"
    : "local-hash";
}

// Strip the 1536-float embedding off an entry doc before returning it.
function stripEmbedding(doc: Doc<"scratchpad_entries">) {
  const { embedding: _embedding, ...rest } = doc;
  return rest;
}

// 1. INTERNAL: embed a single entry if it isn't already embedded. Scheduled by
//    `write` after the row lands. Any failure is swallowed (the un-embedded row
//    still serves indexed reads via by_dag / by_dag_and_node).
export const embedEntry = internalAction({
  args: { entry_id: v.id("scratchpad_entries") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      const entry: Doc<"scratchpad_entries"> | null = await ctx.runQuery(
        internal.scratchpad._getEntry,
        { entry_id: args.entry_id },
      );
      if (!entry) return null;
      if (entry.embedding) return null;

      const embedding = await embedText(entry.content);
      await ctx.runMutation(internal.scratchpad._patchEmbedding, {
        entry_id: args.entry_id,
        embedding,
        embedding_model: modelLabel(),
      });
    } catch (err) {
      console.warn(
        `scratchpadActions.embedEntry: failed to embed ${args.entry_id}: ${
          (err as Error).message
        }`,
      );
    }
    return null;
  },
});

// 2. PUBLIC: write an entry. Verifies the DAG exists, persists the row
//    un-embedded, then schedules async embedding. Returns the new entry id.
export const write = action({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.optional(v.string()),
    task_id: v.optional(v.id("tasks")),
    agent_id: v.string(),
    kind: kindValidator,
    content: v.string(),
    confidence: v.number(),
  },
  returns: v.object({ entry_id: v.id("scratchpad_entries") }),
  handler: async (ctx, args): Promise<{ entry_id: Id<"scratchpad_entries"> }> => {
    const dag = await ctx.runQuery(internal.hiveData._getDag, {
      dag_id: args.dag_id,
    });
    if (!dag) {
      throw new Error("unknown dag_id");
    }

    const entry_id: Id<"scratchpad_entries"> = await ctx.runMutation(
      internal.scratchpad._write,
      {
        dag_id: args.dag_id,
        node_id: args.node_id,
        task_id: args.task_id,
        agent_id: args.agent_id,
        kind: args.kind,
        content: args.content,
        confidence: args.confidence,
      },
    );

    await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
      entry_id,
    });

    return { entry_id };
  },
});

// 3. PUBLIC: semantic recall over a DAG's scratchpad via vector search. Embeds
//    the query, finds nearest entries scoped to dag_id, hydrates each hit, and
//    returns entries (embedding stripped) sorted by score descending.
export const semanticRecall = action({
  args: {
    dag_id: v.id("hive_dags"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      entry: v.any(),
      score: v.number(),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ entry: unknown; score: number }>> => {
    const limit = Math.max(
      1,
      Math.min(SEMANTIC_MAX, args.limit ?? SEMANTIC_DEFAULT),
    );
    const vector = await embedText(args.query);
    const hits = await ctx.vectorSearch("scratchpad_entries", "by_embedding", {
      vector,
      limit,
      filter: (q) => q.eq("dag_id", args.dag_id),
    });

    const results: Array<{ entry: unknown; score: number }> = [];
    for (const hit of hits) {
      const entry: Doc<"scratchpad_entries"> | null = await ctx.runQuery(
        internal.scratchpad._getEntry,
        { entry_id: hit._id },
      );
      if (!entry) continue;
      results.push({ entry: stripEmbedding(entry), score: hit._score });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  },
});
