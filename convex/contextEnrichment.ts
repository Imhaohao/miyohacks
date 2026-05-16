"use node";

/**
 * Pre-bidding enrichment phase.
 *
 * Runs immediately after `tasks.post`. Calls Hyperspell for the `business`
 * slot and Nia for the `repo` slot of the orchestration context
 * (Hyperspell-Nia-Auction packet), supersedes the synthetic stub written by
 * tasks.post, then schedules the auction proper.
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { enrichRepoContextFromNia } from "../lib/nia-loader";
import { addMemory, enrichBusinessContextFromHyperspell } from "../lib/hyperspell";
import type { BusinessContext } from "../lib/orchestration-context";

const BID_WINDOW_MS = 15_000;

export const enrichAndStartAuction = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    const stub = await ctx.runQuery(internal.taskContexts._latestForTask, {
      task_id: args.task_id,
    });

    if (!stub) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "context_enrichment_skipped",
        payload: { reason: "no synthetic stub found" },
      });
      await ctx.scheduler.runAfter(0, internal.broker.shortlist, {
        task_id: args.task_id,
      });
      return;
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "hyperspell_business_context_started",
      payload: { mode: "direct_search", collection: "arbor_task_briefs" },
    });

    const businessEnrichment = await enrichBusinessContextFromHyperspell({
      userId: task.posted_by,
      prompt: task.prompt,
      taskType: task.task_type,
      fallback: stub.business as BusinessContext,
    });

    let business: BusinessContext = stub.business as BusinessContext;
    let promptAddendum = stub.prompt_addendum;

    if (businessEnrichment) {
      business = businessEnrichment.business;
      promptAddendum = `${promptAddendum}\n\nHyperspell business memory (live, ${businessEnrichment.duration_ms}ms, ${businessEnrichment.document_count} docs):\n${businessEnrichment.answer.slice(0, 1500) || "No direct answer returned; matching documents were found and the task brief was added to memory."}`;
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "hyperspell_business_context_added",
        payload: {
          document_count: businessEnrichment.document_count,
          duration_ms: businessEnrichment.duration_ms,
          summary_preview: businessEnrichment.answer.slice(0, 500),
        },
      });
    } else {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "hyperspell_business_context_skipped",
        payload: {
          reason:
            "Hyperspell call failed, returned empty, or HYPERSPELL_API_KEY not set; using heuristic business context.",
        },
      });
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "nia_repo_context_started",
      payload: { tool: "nia_research", mode: "quick" },
    });

    const enriched = await enrichRepoContextFromNia(
      task.prompt,
      task.task_type,
      stub.repo.source_map,
    );

    if (enriched) {
      promptAddendum = `${promptAddendum}\n\nNia repo research (live, ${enriched.duration_ms}ms via nia_research/${enriched.mode}):\n${enriched.raw_summary.slice(0, 1500)}`;
      await ctx.runMutation(internal.taskContexts._insert, {
        task_id: args.task_id,
        version: stub.version,
        business,
        repo: enriched.repo,
        routing: stub.routing,
        prompt_addendum: promptAddendum,
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "nia_repo_context_added",
        payload: {
          char_count: enriched.raw_summary.length,
          duration_ms: enriched.duration_ms,
          summary_preview: enriched.raw_summary.slice(0, 500),
        },
      });
    } else {
      if (businessEnrichment) {
        await ctx.runMutation(internal.taskContexts._insert, {
          task_id: args.task_id,
          version: stub.version,
          business,
          repo: stub.repo,
          routing: stub.routing,
          prompt_addendum: promptAddendum,
        });
      }
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "nia_repo_context_skipped",
        payload: {
          reason:
            "Nia call failed, returned empty, or NIA_API_KEY not set; using heuristic stub.",
        },
      });
    }

    // Reset bid window so the visible 15s clock starts after enrichment.
    const closes_at = Date.now() + BID_WINDOW_MS;
    await ctx.runMutation(internal.tasks._setBidWindow, {
      task_id: args.task_id,
      bid_window_closes_at: closes_at,
    });

    await ctx.scheduler.runAfter(0, internal.broker.shortlist, {
      task_id: args.task_id,
    });
  },
});

export const recordCodexPr = internalAction({
  args: { task_id: v.id("tasks"), pr_url: v.string() },
  handler: async (ctx, args) => {
    if (!process.env.HYPERSPELL_API_KEY) return;
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    await addMemory({
      userId: process.env.HYPERSPELL_USER_ID?.trim() || "agent:codex-writer",
      title: `Codex opened PR for task: ${task.prompt.slice(0, 60)}`,
      collection: "arbor_codex_prs",
      text: [
        `Task id: ${args.task_id}`,
        `Buyer: ${task.posted_by}`,
        `Target repo: ${task.target_repo}`,
        `PR: ${args.pr_url}`,
        "",
        "Task prompt:",
        task.prompt,
      ].join("\n"),
      date: new Date().toISOString(),
      metadata: {
        source: "arbor_codex_pr",
        task_id: args.task_id,
        pr_url: args.pr_url,
      },
    });
  },
});
