"use node";

/**
 * Lets the user fill in the context gap when both Nia and Hyperspell came
 * back empty during enrichment. Appends the user's text to the task's prompt
 * addendum, also persists it as a Hyperspell memory so the next task on the
 * same workspace finds it, then schedules the auction.
 */

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { addMemory } from "../lib/hyperspell";
import type { BusinessContext, RepoContext, RoutingContext } from "../lib/orchestration-context";

const BID_WINDOW_MS = 15_000;

export const provide = action({
  args: {
    task_id: v.id("tasks"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.text.trim();
    if (!trimmed) {
      throw new Error("Context cannot be empty.");
    }

    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    const stub = await ctx.runQuery(internal.taskContexts._latestForTask, {
      task_id: args.task_id,
    });
    if (!stub) {
      throw new Error("Task context not found.");
    }

    const merged = `${stub.prompt_addendum}\n\nUser-provided context (added after Hyperspell + Nia returned no matches):\n${trimmed}`;

    await ctx.runMutation(internal.taskContexts._insert, {
      task_id: args.task_id,
      version: stub.version,
      business: stub.business as BusinessContext,
      repo: stub.repo as RepoContext,
      routing: stub.routing as RoutingContext,
      prompt_addendum: merged,
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "context_user_provided",
      payload: {
        char_count: trimmed.length,
        preview: trimmed.slice(0, 300),
      },
    });

    // Best-effort: stash this in Hyperspell so future tasks on the same
    // workspace can recall it. Don't block the auction if this fails.
    if (process.env.HYPERSPELL_API_KEY) {
      await addMemory({
        userId: task.posted_by,
        title: `Arbor user-provided context: ${task.task_type}`,
        collection: "arbor_user_context",
        text: [
          `Task type: ${task.task_type}`,
          `Original prompt: ${task.prompt}`,
          "",
          trimmed,
        ].join("\n"),
        date: new Date().toISOString(),
        metadata: {
          task_type: task.task_type,
          source: "arbor_user_provided",
        },
      }).catch(() => undefined);
    }

    // Resume the pipeline.
    const closes_at = Date.now() + BID_WINDOW_MS;
    await ctx.runMutation(internal.tasks._setBidWindow, {
      task_id: args.task_id,
      bid_window_closes_at: closes_at,
    });
    await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, {
      task_id: args.task_id,
    });
    await ctx.scheduler.runAfter(BID_WINDOW_MS, internal.auctions.resolve, {
      task_id: args.task_id,
    });
  },
});
