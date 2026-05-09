"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  SPECIALISTS,
  getRunner,
  registerDiscoveredSpecialist,
} from "../lib/specialists/registry";
import { MCP_CATALOG } from "../lib/specialists/catalog";
import type {
  AgentId,
  BidPayload,
  ExecutionArtifact,
  JudgeVerdict,
  SpecialistConfig,
  SpecialistOutput,
} from "../lib/types";
import { callOpenAIJSON } from "../lib/openai";
import {
  buildTaskContext,
  isCampaignTask,
} from "../lib/campaign-context";

const BUYER_ID = "buyer:default";

function normalizeSpecialistOutput(output: SpecialistOutput): {
  text: string;
  artifact?: ExecutionArtifact;
} {
  if (typeof output === "string") return { text: output };
  return {
    text: output.summary,
    artifact: output,
  };
}

// ─── Phase 2: bid solicitation ───────────────────────────────────────────

export const solicitBids = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });

    const taskContext = await ctx.runQuery(internal.taskContexts._latestForTask, {
      task_id: args.task_id,
    });
    const promptForAgents = taskContext
      ? `${task.prompt}\n\n---\n\n${taskContext.prompt_addendum}`
      : task.prompt;

    const discovered = await ctx.runQuery(api.discoveredSpecialists.list, {});
    const discoveredConfigs: SpecialistConfig[] = discovered.map((d) => {
      const cfg: SpecialistConfig = {
        agent_id: d.agent_id,
        display_name: d.display_name,
        sponsor: d.sponsor,
        capabilities: d.capabilities,
        system_prompt: d.system_prompt,
        cost_baseline: d.cost_baseline,
        starting_reputation: d.starting_reputation,
        one_liner: d.one_liner,
        mcp_endpoint: d.mcp_endpoint,
        mcp_api_key_env: d.mcp_api_key_env,
        homepage_url: d.homepage_url,
        discovered: true,
        discovery_source: d.discovery_source,
        discovered_for: d.discovered_for,
      };
      registerDiscoveredSpecialist(cfg);
      return cfg;
    });

    // Auto-enrol every catalog entry (Stripe, Linear, Vercel, etc.) as a
    // bidder unless it's already covered by a sponsor or discovered config.
    const taken = new Set([
      ...SPECIALISTS.map((s) => s.agent_id),
      ...discoveredConfigs.map((d) => d.agent_id),
    ]);
    const catalogConfigs: SpecialistConfig[] = MCP_CATALOG.filter(
      (c) => !taken.has(c.agent_id),
    ).map((c) => {
      const cfg: SpecialistConfig = {
        agent_id: c.agent_id,
        display_name: c.display_name,
        sponsor: c.sponsor,
        capabilities: c.capabilities,
        system_prompt: `You are ${c.display_name}, an MCP-equipped specialist for ${c.sponsor}. Your remote tools cover: ${c.capabilities.join(", ")}. ${c.one_liner} Treat the user's goal on its own terms — never translate it into another domain. Decline cleanly when the goal is outside what your tools can do.`,
        cost_baseline: c.cost_baseline,
        starting_reputation: 0.55,
        one_liner: c.one_liner,
        mcp_endpoint: c.mcp_endpoint,
        mcp_api_key_env: c.mcp_api_key_env,
        homepage_url: c.homepage_url,
        discovered: true,
        discovery_source: "catalog",
        discovered_for: "auto-enrolled from catalog",
      };
      registerDiscoveredSpecialist(cfg);
      return cfg;
    });

    // Make sure every catalog bidder has an agents row so reputation flows.
    await Promise.allSettled(
      catalogConfigs.map((c) =>
        ctx.runMutation(internal.agents._ensureAgent, {
          agent_id: c.agent_id,
          display_name: c.display_name,
          sponsor: c.sponsor,
          capabilities: c.capabilities,
          system_prompt: c.system_prompt,
          cost_per_task_estimate: c.cost_baseline,
          starting_reputation: c.starting_reputation,
        }),
      ),
    );

    // The reacher-live-launch demo bypasses the open auction and routes
    // straight to reacher-social. All other tasks go through the full
    // roster — sponsors plus runtime-discovered specialists plus the
    // auto-enrolled MCP catalog (Stripe, Linear, Vercel, etc.).
    const invitedSpecialists: SpecialistConfig[] =
      task.task_type === "reacher-live-launch"
        ? SPECIALISTS.filter((spec) => spec.agent_id === "reacher-social")
        : [...SPECIALISTS, ...discoveredConfigs, ...catalogConfigs];

    await Promise.allSettled(
      invitedSpecialists.map(async (spec) => {
        const runner = getRunner(spec.agent_id as AgentId);
        const agent = await ctx.runQuery(internal.agents._getByAgentId, {
          agent_id: spec.agent_id,
        });
        const reputation = agent?.reputation_score ?? spec.starting_reputation;

        try {
          const decision = await runner.bid(promptForAgents, task.task_type);
          if ("decline" in decision) {
            await ctx.runMutation(internal.lifecycle.log, {
              task_id: args.task_id,
              event_type: "bid_declined",
              payload: { agent_id: spec.agent_id, reason: decision.reason },
            });
            return;
          }
          const bid = decision satisfies BidPayload;
          const score = reputation / Math.max(0.01, bid.bid_price);
          const bid_id = await ctx.runMutation(internal.bids._insert, {
            task_id: args.task_id,
            agent_id: spec.agent_id,
            bid_price: bid.bid_price,
            capability_claim: bid.capability_claim,
            estimated_seconds: bid.estimated_seconds,
            score,
          });
          await ctx.runMutation(internal.lifecycle.log, {
            task_id: args.task_id,
            event_type: "bid_received",
            payload: {
              bid_id,
              agent_id: spec.agent_id,
              sponsor: spec.sponsor,
              // bid_price kept out of payload to preserve sealed-bid property
              // until the resolver writes the auction_resolved event.
              capability_claim: bid.capability_claim,
              estimated_seconds: bid.estimated_seconds,
            },
          });
        } catch (err) {
          await ctx.runMutation(internal.lifecycle.log, {
            task_id: args.task_id,
            event_type: "bid_declined",
            payload: {
              agent_id: spec.agent_id,
              reason: `error: ${err instanceof Error ? err.message : String(err)}`,
            },
          });
        }
      }),
    );
  },
});

// ─── Phase 3: auction resolution (Vickrey second-price) ──────────────────

export const resolve = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    const allBids = await ctx.runQuery(internal.bids._allForTask, {
      task_id: args.task_id,
    });

    const validBids = allBids.filter((b) => b.bid_price <= task.max_budget);

    if (validBids.length === 0) {
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "failed",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "auction_failed",
        payload: { reason: "no valid bids under budget", all_bids: allBids },
      });
      return;
    }

    // Sort by score (reputation / bid_price) descending. Winner = bids[0].
    const sorted = [...validBids].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    // Vickrey rule per spec: price_paid = bids[1].bid_price (the runner-up's
    // bid price). With only 1 valid bid this degenerates to the winner's own
    // bid (documented).
    const price_paid =
      sorted.length >= 2 ? sorted[1].bid_price : winner.bid_price;

    await ctx.runMutation(internal.escrow._lock, {
      task_id: args.task_id,
      buyer_id: task.posted_by || BUYER_ID,
      seller_id: winner.agent_id,
      locked_amount: price_paid,
    });

    await ctx.runMutation(internal.tasks._setWinner, {
      task_id: args.task_id,
      winning_bid_id: winner._id,
      price_paid,
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "auction_resolved",
      payload: {
        bids: sorted.map((b) => ({
          bid_id: b._id,
          agent_id: b.agent_id,
          bid_price: b.bid_price,
          score: b.score,
          capability_claim: b.capability_claim,
          estimated_seconds: b.estimated_seconds,
        })),
        winner: {
          bid_id: winner._id,
          agent_id: winner.agent_id,
          bid_price: winner.bid_price,
          score: winner.score,
          estimated_seconds: winner.estimated_seconds,
        },
        vickrey: {
          winner_bid_price: winner.bid_price,
          price_paid,
          rule:
            sorted.length >= 2
              ? "second_highest_bid_price"
              : "degenerate_single_bid",
        },
      },
    });

    // Phase 4 — execution.
    await ctx.scheduler.runAfter(0, internal.auctions.execute, {
      task_id: args.task_id,
    });
  },
});

// ─── Phase 4: execution ──────────────────────────────────────────────────

export const execute = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    if (!task.winning_bid_id) {
      throw new Error("execute called without a winning bid");
    }
    const taskContext = await ctx.runQuery(internal.taskContexts._latestForTask, {
      task_id: args.task_id,
    });
    const promptForExecution = taskContext
      ? `${task.prompt}\n\n---\n\n${taskContext.prompt_addendum}`
      : task.prompt;
    const winner = await ctx.runQuery(internal.bids._get, {
      bid_id: task.winning_bid_id,
    });

    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "executing",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "execution_started",
      payload: { agent_id: winner.agent_id },
    });

    try {
      const discoveredEntry = await ctx.runQuery(
        internal.discoveredSpecialists._getByAgentId,
        { agent_id: winner.agent_id },
      );
      if (discoveredEntry) {
        registerDiscoveredSpecialist({
          agent_id: discoveredEntry.agent_id,
          display_name: discoveredEntry.display_name,
          sponsor: discoveredEntry.sponsor,
          capabilities: discoveredEntry.capabilities,
          system_prompt: discoveredEntry.system_prompt,
          cost_baseline: discoveredEntry.cost_baseline,
          starting_reputation: discoveredEntry.starting_reputation,
          one_liner: discoveredEntry.one_liner,
          mcp_endpoint: discoveredEntry.mcp_endpoint,
          mcp_api_key_env: discoveredEntry.mcp_api_key_env,
          homepage_url: discoveredEntry.homepage_url,
          discovered: true,
          discovery_source: discoveredEntry.discovery_source,
          discovered_for: discoveredEntry.discovered_for,
        });
      }
      const runner = getRunner(winner.agent_id as AgentId);
      // 180s cap on execute. MCP-forwarding specialists run multi-round
      // tool-calling loops (6 rounds × ~30s each worst case for Reacher /
      // Nia), so 60s would force a timeout before they finish. Plain
      // (mock) specialists return well under this.
      const result = await Promise.race([
        runner.execute(promptForExecution, task.task_type),
        new Promise<SpecialistOutput>((_, reject) =>
          setTimeout(() => reject(new Error("execution timeout (180s)")), 180_000),
        ),
      ]);
      const normalized = normalizeSpecialistOutput(result);

      await ctx.runMutation(internal.tasks._setResult, {
        task_id: args.task_id,
        result: {
          text: normalized.text,
          agent_id: winner.agent_id,
          artifact: normalized.artifact,
        },
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "execution_complete",
        payload: { agent_id: winner.agent_id, length: normalized.text.length },
      });

      // Phase 5 — judge.
      await ctx.scheduler.runAfter(0, internal.auctions.judge, {
        task_id: args.task_id,
      });
    } catch (err) {
      await ctx.runMutation(internal.escrow._settle, {
        task_id: args.task_id,
        status: "refunded",
      });
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "failed",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "execution_failed",
        payload: {
          agent_id: winner.agent_id,
          reason: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },
});

// ─── Phase 5: judge ──────────────────────────────────────────────────────

const JUDGE_GENERAL_PROMPT = `You are an impartial judge for a general-purpose agent marketplace. The user described a goal in their own words; a specialist agent produced a deliverable. Decide whether the deliverable actually addresses the user's goal in a useful, specific, well-reasoned way. Output JSON only:
{ "verdict": "accept" | "reject", "reasoning": "<one paragraph>", "quality_score": <0.0-1.0> }

Strict rules for your reasoning paragraph:
- Describe ONLY content that is literally present in the agent's output. Do not invent topics, sections, or shortcomings.
- Quote or paraphrase specific phrases from the output to ground every claim you make.
- If the output is shorter than expected, say so plainly — don't fabricate missing content.

Reject when the deliverable is off-topic from the goal, vague hand-waving, ignores an explicit constraint the user stated, or is so incomplete it can't be used. Accept when the output materially advances the user's goal — perfection is not required.`;

const JUDGE_CAMPAIGN_PROMPT = `You are an impartial judge for a creator-campaign workflow. Evaluate whether the winning agent output satisfies the campaign brief and is grounded in Reacher TikTok Shop evidence plus Nia-backed context. Output JSON only:
{ "verdict": "accept" | "reject", "reasoning": "<one paragraph>", "quality_score": <0.0-1.0> }

Be strict but fair. Reject if the output lacks a creator shortlist, outreach drafts, sample-request notes, risk evaluation, or evidence tied to Reacher/Nia context. Accept if it satisfies the campaign workflow even if imperfect.`;

export const judge = internalAction({
  args: {
    task_id: v.id("tasks"),
    dispute_reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    if (!task.result) throw new Error("judge called without a result");

    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "judging",
    });

    const taskContext = await ctx.runQuery(internal.taskContexts._latestForTask, {
      task_id: args.task_id,
    });

    const userPrompt = [
      taskContext ? taskContext.prompt_addendum : null,
      task.task_type === "reacher-live-launch"
        ? "This is the live Reacher proof workflow. The seeded demo creators in the generic campaign evidence are illustrative only. Do not reject merely because the agent used different creators. For this workflow, prefer live Reacher MCP evidence from tools such as list_shops_shops_get, creators_performance_creators_performance_post, and creators_list_creators_list_post. Accept if the output cites those live tool results and includes a creator shortlist, outreach drafts, sample notes, risk flags, and a 7-day launch plan."
        : null,
      buildTaskContext(task.prompt, task.task_type),
      task.output_schema
        ? `Required output schema:\n${JSON.stringify(task.output_schema, null, 2)}`
        : null,
      args.dispute_reason
        ? `Buyer dispute reason (re-evaluate with this in mind):\n${args.dispute_reason}`
        : null,
      `Agent output:\n${typeof task.result === "object" && task.result && "text" in task.result ? (task.result as { text: string }).text : JSON.stringify(task.result)}`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const judgeSystemPrompt = isCampaignTask(task.task_type)
      ? JUDGE_CAMPAIGN_PROMPT
      : JUDGE_GENERAL_PROMPT;

    let verdict: JudgeVerdict;
    try {
      verdict = await Promise.race([
        callOpenAIJSON<JudgeVerdict>({
          systemPrompt: judgeSystemPrompt,
          userPrompt,
          maxTokens: 512,
          timeoutMs: 20_000,
          retries: 1,
        }),
        new Promise<JudgeVerdict>((_, reject) =>
          setTimeout(() => reject(new Error("judge timeout (20s)")), 20_000),
        ),
      ]);
    } catch (err) {
      verdict = {
        verdict: "reject",
        reasoning: `Judge call failed: ${err instanceof Error ? err.message : String(err)}`,
        quality_score: 0,
      };
    }

    // Clamp quality_score in case the judge returns something out of range.
    verdict.quality_score = Math.max(0, Math.min(1, verdict.quality_score));

    await ctx.runMutation(internal.tasks._setVerdict, {
      task_id: args.task_id,
      verdict,
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "judge_verdict",
      payload: verdict,
    });

    await ctx.scheduler.runAfter(0, internal.auctions.settle, {
      task_id: args.task_id,
    });
  },
});

// ─── Phase 6: settle ─────────────────────────────────────────────────────

export const settle = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    if (!task.judge_verdict) {
      throw new Error("settle called without verdict");
    }
    const verdict = task.judge_verdict as JudgeVerdict;

    // Parent tasks in a multi-step plan have no winning bid of their own —
    // each child was auctioned and settled separately. The parent gets a
    // synthesized result, judged once, and lands as complete/disputed without
    // a second round of escrow or reputation.
    if (!task.winning_bid_id) {
      const finalStatus = verdict.verdict === "accept" ? "complete" : "disputed";
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: finalStatus,
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "settled",
        payload: {
          verdict: verdict.verdict,
          synthesized: true,
          quality_score: verdict.quality_score,
        },
      });
      return;
    }

    const winner = await ctx.runQuery(internal.bids._get, {
      bid_id: task.winning_bid_id,
    });

    // Capture actual runtime from lifecycle events for the dimensions record.
    const lifecycle = await ctx.runQuery(internal.lifecycle._forTask, {
      task_id: args.task_id,
    });
    const startedAt = lifecycle.find(
      (e) => e.event_type === "execution_started",
    )?.timestamp;
    const completedAt = lifecycle.find(
      (e) => e.event_type === "execution_complete",
    )?.timestamp;
    const actualSeconds =
      startedAt && completedAt
        ? Math.max(0.1, (completedAt - startedAt) / 1000)
        : winner.estimated_seconds;

    await ctx.runMutation(internal.reputationDimensions._record, {
      agent_id: winner.agent_id,
      task_id: args.task_id,
      actual_seconds: actualSeconds,
      estimated_seconds: winner.estimated_seconds,
      quality_score: verdict.quality_score,
      accepted: verdict.verdict === "accept",
      bid_price: winner.bid_price,
      price_paid: task.price_paid ?? winner.bid_price,
    });

    if (verdict.verdict === "accept") {
      await ctx.runMutation(internal.escrow._settle, {
        task_id: args.task_id,
        status: "released",
      });
      const delta = 0.05 * verdict.quality_score;
      const { new_score } = await ctx.runMutation(
        internal.agents._applyReputationDelta,
        {
          agent_id: winner.agent_id,
          task_id: args.task_id,
          delta,
          event_type: "task_accepted",
          reasoning: verdict.reasoning,
          increment_completed: true,
          increment_disputes_lost: false,
        },
      );
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "complete",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "settled",
        payload: {
          verdict: "accept",
          escrow: "released",
          seller_id: winner.agent_id,
          delta,
          new_score,
          price_paid: task.price_paid,
        },
      });
    } else {
      await ctx.runMutation(internal.escrow._settle, {
        task_id: args.task_id,
        status: "refunded",
      });
      const delta = -0.10;
      const { new_score } = await ctx.runMutation(
        internal.agents._applyReputationDelta,
        {
          agent_id: winner.agent_id,
          task_id: args.task_id,
          delta,
          event_type: "task_rejected",
          reasoning: verdict.reasoning,
          increment_completed: false,
          increment_disputes_lost: true,
        },
      );
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "disputed",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "settled",
        payload: {
          verdict: "reject",
          escrow: "refunded",
          seller_id: winner.agent_id,
          delta,
          new_score,
          price_paid: task.price_paid,
        },
      });
    }

    // If this is a sub-task in a multi-step plan, hand control back to the
    // planner to advance to the next step or trigger synthesis. The parent
    // task gets the final synthesized output and is judged separately.
    if (task.parent_task_id) {
      await ctx.scheduler.runAfter(0, internal.planning.advanceOrSynthesize, {
        task_id: args.task_id,
      });
    }
  },
});
