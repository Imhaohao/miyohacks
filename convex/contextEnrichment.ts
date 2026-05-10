"use node";

/**
 * Pre-bidding enrichment phase.
 *
 * Runs immediately after `tasks.post`. Calls Hyperspell for the `business`
 * slot and Nia for the `repo` slot of the orchestration context, supersedes
 * the synthetic stub written by tasks.post, then schedules the auction.
 *
 * If BOTH Hyperspell and Nia come back empty, we don't schedule the auction.
 * Instead we emit `context_request_needed` and wait for the user to fill in
 * the gap via `userContext.provide`. That mutation resumes the pipeline.
 */

import { internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { enrichRepoContextFromNia } from "../lib/nia-loader";
import { enrichBusinessContextFromHyperspell } from "../lib/hyperspell";
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
      await scheduleAuction(ctx, args.task_id);
      return;
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "hyperspell_business_context_started",
      payload: { mode: "direct_search", collection: "arbor_task_briefs" },
    });

    const businessOutcome = await enrichBusinessContextFromHyperspell({
      userId: task.posted_by,
      prompt: task.prompt,
      taskType: task.task_type,
      fallback: stub.business as BusinessContext,
    });

    let business: BusinessContext = stub.business as BusinessContext;
    let promptAddendum = stub.prompt_addendum;

    if (businessOutcome.ok) {
      const enrichment = businessOutcome.enrichment;
      business = enrichment.business;
      promptAddendum = `${promptAddendum}\n\nHyperspell business memory (live, ${enrichment.duration_ms}ms, ${enrichment.document_count} docs):\n${enrichment.answer.slice(0, 1500) || "No direct answer returned; matching documents were found and the task brief was added to memory."}`;
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "hyperspell_business_context_added",
        payload: {
          document_count: enrichment.document_count,
          duration_ms: enrichment.duration_ms,
          summary_preview: enrichment.answer.slice(0, 500),
          user_id_used: enrichment.user_id_used,
        },
      });
    } else {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "hyperspell_business_context_skipped",
        payload: {
          reason: businessOutcome.reason,
          user_id_used: businessOutcome.user_id_used,
          duration_ms: businessOutcome.duration_ms,
        },
      });
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "nia_repo_context_started",
      payload: { tool: "search", mode: "indexed" },
    });

    const enriched = await enrichRepoContextFromNia(
      task.prompt,
      task.task_type,
      stub.repo.source_map,
    );

    if (enriched) {
      const sourceLabel =
        enriched.tool === "search"
          ? "your indexed Nia sources (repos, docs)"
          : "Nia web research (no indexed match — fell back to public web)";
      promptAddendum = `${promptAddendum}\n\nNia repo context (live, ${enriched.duration_ms}ms via ${enriched.tool}/${enriched.mode}, from ${sourceLabel}):\n${enriched.raw_summary.slice(0, 1500)}`;
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
          tool: enriched.tool,
          mode: enriched.mode,
          source_kind:
            enriched.tool === "search" ? "indexed_sources" : "web_research",
          char_count: enriched.raw_summary.length,
          duration_ms: enriched.duration_ms,
          summary_preview: enriched.raw_summary.slice(0, 500),
        },
      });
    } else {
      if (businessOutcome.ok) {
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

    // Both platforms came back empty — pause and ask the user for the missing
    // context instead of letting specialists bid on a heuristic stub.
    if (!businessOutcome.ok && !enriched) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "context_request_needed",
        payload: {
          searched: ["hyperspell", "nia"],
          task_prompt: task.prompt,
          message:
            "We searched your Hyperspell workspace and Nia repo context but couldn't find anything relevant to this task. Tell us a bit more so the right specialist can take it on.",
        },
      });
      return;
    }

    await scheduleAuction(ctx, args.task_id);
  },
});

async function scheduleAuction(ctx: ActionCtx, task_id: Id<"tasks">) {
  // Reset bid window so the visible 15s clock starts after enrichment.
  const closes_at = Date.now() + BID_WINDOW_MS;
  await ctx.runMutation(internal.tasks._setBidWindow, {
    task_id,
    bid_window_closes_at: closes_at,
  });
  await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, { task_id });
  await ctx.scheduler.runAfter(BID_WINDOW_MS, internal.auctions.resolve, {
    task_id,
  });
}
