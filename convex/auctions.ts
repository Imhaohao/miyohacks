"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { SPECIALISTS, getRunner } from "../lib/specialists/registry";
import type { AgentId, BidPayload, JudgeVerdict } from "../lib/types";
import { callOpenAIJSON } from "../lib/openai";
import { buildCampaignEvidence } from "../lib/campaign-context";

const BUYER_ID = "buyer:default";

// ─── Phase 2: bid solicitation ───────────────────────────────────────────

export const solicitBids = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    const invitedSpecialists =
      task.task_type === "reacher-live-launch"
        ? SPECIALISTS.filter((spec) => spec.agent_id === "reacher-social")
        : SPECIALISTS;

    await Promise.allSettled(
      invitedSpecialists.map(async (spec) => {
        const runner = getRunner(spec.agent_id as AgentId);
        const agent = await ctx.runQuery(internal.agents._getByAgentId, {
          agent_id: spec.agent_id,
        });
        const reputation = agent?.reputation_score ?? spec.starting_reputation;

        try {
          const decision = await runner.bid(task.prompt, task.task_type);
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
      const runner = getRunner(winner.agent_id as AgentId);
      // 180s cap on execute. MCP-forwarding specialists run multi-round
      // tool-calling loops (6 rounds × ~30s each worst case for Reacher /
      // Nia), so 60s would force a timeout before they finish. Plain
      // (mock) specialists return well under this.
      const result = await Promise.race([
        runner.execute(task.prompt, task.task_type),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("execution timeout (180s)")), 180_000),
        ),
      ]);

      await ctx.runMutation(internal.tasks._setResult, {
        task_id: args.task_id,
        result: { text: result, agent_id: winner.agent_id },
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "execution_complete",
        payload: { agent_id: winner.agent_id, length: result.length },
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

const JUDGE_SYSTEM_PROMPT = `You are an impartial judge for an autonomous creator-campaign marketplace. Evaluate whether the winning agent output satisfies the campaign brief and is grounded in Reacher TikTok Shop evidence plus Nia-backed context. Output JSON only:
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

    const userPrompt = [
      task.task_type === "reacher-live-launch"
        ? "This is the live Reacher proof workflow. The seeded demo creators in the generic campaign evidence are illustrative only. Do not reject merely because the agent used different creators. For this workflow, prefer live Reacher MCP evidence from tools such as list_shops_shops_get, creators_performance_creators_performance_post, and creators_list_creators_list_post. Accept if the output cites those live tool results and includes a creator shortlist, outreach drafts, sample notes, risk flags, and a 7-day launch plan."
        : null,
      buildCampaignEvidence(task.prompt, task.task_type),
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

    let verdict: JudgeVerdict;
    try {
      verdict = await Promise.race([
        callOpenAIJSON<JudgeVerdict>({
          systemPrompt: JUDGE_SYSTEM_PROMPT,
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
    if (!task.winning_bid_id || !task.judge_verdict) {
      throw new Error("settle called without winner or verdict");
    }
    const winner = await ctx.runQuery(internal.bids._get, {
      bid_id: task.winning_bid_id,
    });
    const verdict = task.judge_verdict as JudgeVerdict;

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
  },
});
