// Hive-mind Layer 4 shared context store: default-runtime queries + mutations.
// NO "use node" — this file only does database I/O. Embedding (which needs the
// embeddings helper and runs network calls) lives in convex/scratchpadActions.ts.
//
// Writes land instantly UN-embedded; an async action embeds them afterwards via
// _patchEmbedding. Every read is index-based; no .filter.

import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

const kindValidator = v.union(
  v.literal("observation"),
  v.literal("result"),
  v.literal("decision"),
  v.literal("question"),
);

const MAX_CONTENT_CHARS = 16_000;
const RECENT_DEFAULT = 5;
const RECENT_MAX = 50;
const FOR_DAG_LIMIT = 200;
const FOR_NODE_LIMIT = 50;

// Entry shape with the 1536-float embedding field STRIPPED, for client payloads.
const entryWithoutEmbeddingValidator = v.object({
  _id: v.id("scratchpad_entries"),
  _creationTime: v.number(),
  dag_id: v.id("hive_dags"),
  node_id: v.optional(v.string()),
  task_id: v.optional(v.id("tasks")),
  agent_id: v.string(),
  kind: kindValidator,
  content: v.string(),
  confidence: v.number(),
  embedding_model: v.optional(v.string()),
  created_at: v.number(),
});

type EntryWithoutEmbedding = Omit<Doc<"scratchpad_entries">, "embedding">;

function stripEmbedding(doc: Doc<"scratchpad_entries">): EntryWithoutEmbedding {
  const { embedding: _embedding, ...rest } = doc;
  return rest;
}

// 1. Insert a scratchpad entry (un-embedded). Returns the new row id so the
//    caller can schedule embedding.
export const _write = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.optional(v.string()),
    task_id: v.optional(v.id("tasks")),
    agent_id: v.string(),
    kind: kindValidator,
    content: v.string(),
    confidence: v.number(),
  },
  returns: v.id("scratchpad_entries"),
  handler: async (ctx, args): Promise<Id<"scratchpad_entries">> => {
    const confidence = Math.max(0, Math.min(1, args.confidence));
    const content = args.content.slice(0, MAX_CONTENT_CHARS);
    return await ctx.db.insert("scratchpad_entries", {
      dag_id: args.dag_id,
      node_id: args.node_id,
      task_id: args.task_id,
      agent_id: args.agent_id,
      kind: args.kind,
      content,
      confidence,
      created_at: Date.now(),
    });
  },
});

// 2. Patch the embedding vector + model onto an existing entry.
export const _patchEmbedding = internalMutation({
  args: {
    entry_id: v.id("scratchpad_entries"),
    embedding: v.array(v.float64()),
    embedding_model: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.entry_id, {
      embedding: args.embedding,
      embedding_model: args.embedding_model,
    });
    return null;
  },
});

// 3. The N most-recent entries for a DAG (newest first).
export const _recent = internalQuery({
  args: { dag_id: v.id("hive_dags"), limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"scratchpad_entries">>> => {
    const limit = Math.max(1, Math.min(RECENT_MAX, args.limit ?? RECENT_DEFAULT));
    return await ctx.db
      .query("scratchpad_entries")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .order("desc")
      .take(limit);
  },
});

// 4. Up to 200 entries for a DAG (newest first).
export const _forDag = internalQuery({
  args: { dag_id: v.id("hive_dags") },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"scratchpad_entries">>> => {
    return await ctx.db
      .query("scratchpad_entries")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .order("desc")
      .take(FOR_DAG_LIMIT);
  },
});

// 5. Up to 50 entries for a specific node within a DAG (newest first).
export const _forNode = internalQuery({
  args: { dag_id: v.id("hive_dags"), node_id: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"scratchpad_entries">>> => {
    return await ctx.db
      .query("scratchpad_entries")
      .withIndex("by_dag_and_node", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .order("desc")
      .take(FOR_NODE_LIMIT);
  },
});

// 6. Get a single entry by id (or null).
export const _getEntry = internalQuery({
  args: { entry_id: v.id("scratchpad_entries") },
  returns: v.union(v.any(), v.null()),
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"scratchpad_entries"> | null> => {
    return await ctx.db.get(args.entry_id);
  },
});

// 7. PUBLIC: all entries for a DAG with the embedding vector stripped, so the
//    1536-float arrays never cross the wire to the client.
export const forDag = query({
  args: { dag_id: v.id("hive_dags") },
  returns: v.array(entryWithoutEmbeddingValidator),
  handler: async (ctx, args): Promise<Array<EntryWithoutEmbedding>> => {
    const rows = await ctx.db
      .query("scratchpad_entries")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .order("desc")
      .take(FOR_DAG_LIMIT);
    return rows.map(stripEmbedding);
  },
});
