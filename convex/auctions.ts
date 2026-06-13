"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  SPECIALISTS,
  getRunner,
  registerDiscoveredSpecialist,
  toPublicTier,
} from "../lib/specialists/registry";
import { makeMockSpecialist } from "../lib/specialists/base";
import { MCP_CATALOG } from "../lib/specialists/catalog";
import type {
  AgentId,
  BidPayload,
  ExecutionArtifact,
  JudgeVerdict,
  ProbeResult,
  SpecialistConfig,
  SpecialistOutput,
  SpecialistProvenance,
  ToolCallAuditInput,
  ToolCallAuditOutcome,
  ToolCallRecorder,
} from "../lib/types";
import { callOpenAIJSON } from "../lib/openai";
import { buildTaskContext } from "../lib/campaign-context";
import {
  endpointHost,
  finalizeProvenance,
  previewValue,
  redactToolArguments,
} from "../lib/tool-call-audit";
import { sha256Hex } from "../lib/a2a-hmac";

const BUYER_ID = "buyer:default";

function stripeCheckoutMode(): boolean {
  return process.env.ARBOR_PAYMENTS_MODE === "stripe_checkout";
}

function stripeCurrency(): string {
  return (process.env.STRIPE_CURRENCY ?? "usd").toLowerCase();
}

function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is required for Stripe settlement");
  return key;
}

function latestChargeId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

async function stripePost(
  path: string,
  params: URLSearchParams,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeSecretKey()}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: params,
  });
  const body = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!response.ok) {
    const message =
      body &&
      typeof body.error === "object" &&
      body.error &&
      "message" in body.error
        ? String((body.error as { message?: unknown }).message)
        : `Stripe API error ${response.status}`;
    throw new Error(message);
  }
  return body ?? {};
}

async function captureStripePaymentForTask(
  ctx: ActionCtx,
  task_id: Id<"tasks">,
) {
  if (!stripeCheckoutMode()) return;
  const escrow = (await ctx.runQuery(api.escrow.forTask, { task_id })) as
    | {
        payment_processor?: string;
        payment_status?: string;
        stripe_payment_intent_id?: string;
        stripe_charge_id?: string;
      }
    | null;
  if (!escrow || escrow.payment_processor !== "stripe") return;
  if (escrow.payment_status === "captured") return;
  if (!escrow.stripe_payment_intent_id) {
    throw new Error("Stripe payment intent missing for real-money settlement");
  }
  if (escrow.payment_status !== "authorized") {
    throw new Error(
      `Stripe payment must be authorized before capture; got ${escrow.payment_status ?? "unknown"}`,
    );
  }
  const intent = await stripePost(
    `payment_intents/${escrow.stripe_payment_intent_id}/capture`,
    new URLSearchParams(),
    `arbor_capture_${task_id}_${escrow.stripe_payment_intent_id}`,
  );
  const chargeId = latestChargeId(intent.latest_charge) ?? escrow.stripe_charge_id;
  await ctx.runMutation(internal.escrow._markStripeCaptured, {
    task_id,
    stripe_payment_intent_id: escrow.stripe_payment_intent_id,
    stripe_charge_id: chargeId,
  });
  await ctx.runMutation(internal.tasks._setPaymentStatus, {
    task_id,
    payment_status: "captured",
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "stripe_payment_captured",
    payload: {
      stripe_payment_intent_id: escrow.stripe_payment_intent_id,
      stripe_charge_id: chargeId,
    },
  });
}

async function cancelStripePaymentForTask(
  ctx: ActionCtx,
  task_id: Id<"tasks">,
  reason: string,
) {
  if (!stripeCheckoutMode()) return;
  const escrow = (await ctx.runQuery(api.escrow.forTask, { task_id })) as
    | {
        payment_processor?: string;
        payment_status?: string;
        stripe_payment_intent_id?: string;
      }
    | null;
  if (!escrow || escrow.payment_processor !== "stripe") return;
  if (escrow.payment_status === "canceled" || escrow.payment_status === "captured") {
    return;
  }
  if (!escrow.stripe_payment_intent_id) return;
  if (escrow.payment_status === "authorized") {
    const params = new URLSearchParams();
    params.set("cancellation_reason", "requested_by_customer");
    await stripePost(
      `payment_intents/${escrow.stripe_payment_intent_id}/cancel`,
      params,
      `arbor_cancel_${task_id}_${escrow.stripe_payment_intent_id}`,
    );
  }
  await ctx.runMutation(internal.escrow._markStripeCanceled, {
    task_id,
    stripe_payment_intent_id: escrow.stripe_payment_intent_id,
    reason,
  });
  await ctx.runMutation(internal.tasks._setPaymentStatus, {
    task_id,
    payment_status: "canceled",
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "stripe_payment_canceled",
    payload: {
      stripe_payment_intent_id: escrow.stripe_payment_intent_id,
      reason,
    },
  });
}

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

function formatResultForJudge(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    return JSON.stringify(result, null, 2);
  }
  return JSON.stringify(result);
}

function cleanArgs<T extends Record<string, unknown>>(input: T): T {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}

function makeToolCallRecorder(
  ctx: ActionCtx,
  task_id: Id<"tasks">,
  defaultAgentId: string,
): ToolCallRecorder {
  const successfulIds: string[] = [];

  return {
    async record(input, run, outcome) {
      const callId: Id<"agent_tool_calls"> = await ctx.runMutation(
        internal.agentToolCalls.start,
        cleanArgs({
          task_id,
          agent_id: input.agent_id ?? defaultAgentId,
          phase: input.phase,
          transport: input.transport,
          provider: input.provider,
          endpoint_host: endpointHost(input.endpoint),
          method: input.method,
          tool_name: input.tool_name,
          call_id: input.call_id,
          arguments_redacted: redactToolArguments(input.arguments ?? {}),
        }),
      );

      try {
        const result = await run();
        const audit: ToolCallAuditOutcome = outcome
          ? outcome(result)
          : { ok: true, result_preview: previewValue(result) };
        if (audit.ok) {
          const artifact_hash =
            audit.result_preview && audit.result_preview.trim().length > 0
              ? sha256Hex(audit.result_preview)
              : undefined;
          await ctx.runMutation(
            internal.agentToolCalls.succeed,
            cleanArgs({
              call_id: callId,
              result_preview: audit.result_preview,
              external_session_id: audit.external_session_id,
              external_task_id: audit.external_task_id,
              pr_url: audit.pr_url,
              pr_number: audit.pr_number,
              artifact_hash,
            }),
          );
          successfulIds.push(callId);
        } else {
          await ctx.runMutation(
            internal.agentToolCalls.fail,
            cleanArgs({
              call_id: callId,
              error_message:
                audit.error_message ?? "Tool call returned an error result.",
              result_preview: audit.result_preview,
              external_session_id: audit.external_session_id,
              external_task_id: audit.external_task_id,
            }),
          );
        }
        return result;
      } catch (err) {
        await ctx.runMutation(
          internal.agentToolCalls.fail,
          cleanArgs({
            call_id: callId,
            error_message: err instanceof Error ? err.message : String(err),
          }),
        );
        throw err;
      }
    },
    successfulCallIds() {
      return [...successfulIds];
    },
  };
}

/**
 * Auctioneer-side plan screen. Every bid's capability_claim must read as a
 * plausible, task-specific plan — concrete steps that engage with the task's
 * actual subject matter. Fail-open: if the screening model is unreachable the
 * bid stands (the screen improves quality, it must never empty the auction).
 */
async function assessPlanPlausibility(
  taskPrompt: string,
  plan: string,
): Promise<{ plausible: boolean; reason: string }> {
  if (plan.trim().length < 40) {
    return { plausible: false, reason: "plan too short to be actionable" };
  }
  try {
    const verdict = await callOpenAIJSON<{
      plausible?: boolean;
      reason?: string;
    }>({
      systemPrompt: `You screen bids in an agent marketplace. Given a user's task and a bidder's plan, decide whether the plan is a plausible, task-specific approach: it must engage with the task's actual subject matter and describe concrete steps. Reject generic capability pitches, plans about a different domain than the task, and filler. A bracketed provenance note like "[Plan drafted by Arbor ...]" is fine and not grounds for rejection. Output JSON only: { "plausible": true|false, "reason": "<short>" }`,
      userPrompt: `Task:\n${taskPrompt.slice(0, 1200)}\n\nBidder's plan:\n${plan.slice(0, 1200)}`,
      maxTokens: 128,
      timeoutMs: 6_000,
      retries: 0,
      purpose: "judge",
    });
    if (typeof verdict.plausible === "boolean") {
      return { plausible: verdict.plausible, reason: verdict.reason ?? "" };
    }
    return { plausible: true, reason: "screen returned malformed verdict (fail-open)" };
  } catch (err) {
    return {
      plausible: true,
      reason: `screen unavailable (fail-open): ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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

    const discovered = (await ctx.runQuery(
      api.discoveredSpecialists.list,
      {},
    )) as Array<Doc<"discovered_specialists">>;
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
        a2a_endpoint: d.a2a_endpoint,
        a2a_agent_card_url: d.a2a_agent_card_url,
        a2a_api_key_env: d.a2a_api_key_env,
        a2a_auth_mode: d.a2a_auth_mode,
        homepage_url: d.homepage_url,
        discovered: true,
        discovery_source: d.discovery_source,
        discovered_for: d.discovered_for,
        tier: d.a2a_endpoint
          ? "a2a"
          : d.mcp_endpoint
            ? "mcp-forwarding"
            : "mock",
      };
      registerDiscoveredSpecialist(cfg);
      return cfg;
    });

    // Hydrate outbound A2A keys from the Convex vault: any specialist whose
    // key env var is unset gets it populated from a2a_outbound_keys so keyed
    // agents can bid without env-var redeploys (console-pasted or
    // auto-acquired keys take effect on the next auction).
    try {
      const vaultRows = await ctx.runQuery(internal.a2aOutboundKeys._getAll, {});
      const byAgent = new Map(vaultRows.map((k) => [k.agent_id, k.api_key]));
      for (const cfg of discoveredConfigs) {
        if (
          cfg.a2a_auth_mode !== "none" &&
          cfg.a2a_api_key_env &&
          !process.env[cfg.a2a_api_key_env]
        ) {
          const key = byAgent.get(cfg.agent_id);
          if (key) process.env[cfg.a2a_api_key_env] = key;
        }
      }
    } catch {
      // Vault read failure -> keyed agents without env vars decline cleanly.
    }

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
        tier: "mcp-forwarding",
      };
      registerDiscoveredSpecialist(cfg);
      return cfg;
    });

    // Open auction: every registered specialist gets a chance to bid. Each
    // runner's bid prompt tells it to decline when the task is out of scope,
    // and the Vickrey score (reputation / bid_price) handles the rest.
    const roster = [...SPECIALISTS, ...discoveredConfigs, ...catalogConfigs];

    // Make sure every bidder has an agents row so reputation reads use the
    // live score and settlement's _applyReputationDelta never hits a missing
    // row (registry-only specialists like arbor-worker-a2a used to crash
    // settle and strand tasks in "judging").
    await Promise.allSettled(
      roster.map((c) =>
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
    const invitedIds =
      Array.isArray(task.invited_agent_ids) && task.invited_agent_ids.length > 0
        ? new Set(task.invited_agent_ids)
        : null;
    let invitedSpecialists: SpecialistConfig[];
    if (task.task_type === "reacher-live-launch") {
      // Sponsor-demo invariant: reacher-live-launch always solicits only
      // reacher-social, regardless of any per-task shortlist.
      invitedSpecialists = SPECIALISTS.filter(
        (spec) => spec.agent_id === "reacher-social",
      );
    } else if (invitedIds) {
      invitedSpecialists = roster.filter((spec) => invitedIds.has(spec.agent_id));
      if (invitedSpecialists.length === 0) {
        // Over-restrictive shortlist (no roster member matches): degrade to
        // the open auction rather than guaranteeing an auction_failed.
        invitedSpecialists = roster;
        await ctx.runMutation(internal.lifecycle.log, {
          task_id: args.task_id,
          event_type: "auction_shortlist_empty",
          payload: {
            invited_agent_ids: task.invited_agent_ids,
            matched: [],
          },
        });
      } else {
        await ctx.runMutation(internal.lifecycle.log, {
          task_id: args.task_id,
          event_type: "auction_shortlisted",
          payload: {
            invited_agent_ids: task.invited_agent_ids,
            matched: invitedSpecialists.map((s) => s.agent_id),
          },
        });
      }
    } else {
      invitedSpecialists = roster;
    }

    await Promise.allSettled(
      invitedSpecialists.map(async (spec) => {
        const solicitStart = Date.now();
        const agent = await ctx.runQuery(internal.agents._getByAgentId, {
          agent_id: spec.agent_id,
        });
        const reputation = agent?.reputation_score ?? spec.starting_reputation;

        // A listed MCP specialist whose declared API key env var is absent
        // can never run live — its probe would fail with "env not set".
        // Route it to the demo lane instead of pretending the endpoint is
        // broken. A2A key envs are NOT checked here: they are optional
        // (bearer only when the agent card demands it), and the card-auth
        // resolver already fails closed when auth is genuinely required.
        const missingKeyEnv =
          spec.mcp_api_key_env && !process.env[spec.mcp_api_key_env]
            ? spec.mcp_api_key_env
            : undefined;

        const runner = getRunner(spec.agent_id as AgentId);
        const liveCapable = Boolean(runner.probe) && !missingKeyEnv;

        // Demo-lane policy: only Arbor's own listed specialists (the static
        // roster shown on /agents) may bid via the labeled persona lane.
        // Discovered/catalog third parties never get plans authored for them.
        const demoEligible = !spec.discovered;
        const public_tier = liveCapable
          ? toPublicTier(spec.tier)
          : toPublicTier("mock");

        if (!liveCapable && !demoEligible) {
          const probe_id = await ctx.runMutation(internal.bidProbes._insert, {
            task_id: args.task_id,
            agent_id: spec.agent_id,
            public_tier,
            probe_status: "demo_lane",
            duration_ms: 0,
            error_message: missingKeyEnv
              ? `unconfigured: ${missingKeyEnv} not set`
              : undefined,
            created_at: Date.now(),
          });
          await ctx.runMutation(internal.lifecycle.log, {
            task_id: args.task_id,
            event_type: "bid_declined",
            payload: {
              agent_id: spec.agent_id,
              reason: "demo_lane — no live probe",
              public_tier,
              probe_id,
            },
          });
          return;
        }

        // ─── Probe and bid run concurrently. The serial probe→bid chain
        // (8s + 12s worst case) could not fit tunneled A2A agents inside a
        // 30s window; in parallel the slower leg dominates. A bid whose
        // probe fails is discarded — liveness still gates the auction.
        const probeStart = Date.now();
        const probePromise: Promise<ProbeResult> = liveCapable
          ? runner.probe!(task.task_type).catch((err) => ({
              status: "fail" as const,
              duration_ms: Date.now() - probeStart,
              error_message: err instanceof Error ? err.message : String(err),
            }))
          : Promise.resolve({
              status: "demo_lane" as const,
              duration_ms: 0,
              error_message: missingKeyEnv
                ? `unconfigured: ${missingKeyEnv} not set`
                : undefined,
            });

        // Demo-lane bids always come from the persona runner with an explicit
        // mock tier, so provenance labels and bid plans never overstate what
        // the specialist can actually reach.
        const bidRunner = liveCapable
          ? runner
          : makeMockSpecialist({ ...spec, tier: "mock" });
        const bidPromise = bidRunner
          .bid(promptForAgents, task.task_type)
          .then((decision) => ({ ok: true as const, decision }))
          .catch((err) => ({
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          }));

        const [probe, bidOutcome] = await Promise.all([
          probePromise,
          bidPromise,
        ]);

        const probe_id = await ctx.runMutation(internal.bidProbes._insert, {
          task_id: args.task_id,
          agent_id: spec.agent_id,
          public_tier,
          probe_status: probe.status,
          duration_ms: probe.duration_ms,
          response_excerpt: probe.response_excerpt,
          error_message: probe.error_message,
          created_at: Date.now(),
        });

        if (probe.status === "fail") {
          await ctx.runMutation(internal.lifecycle.log, {
            task_id: args.task_id,
            event_type: "bid_declined",
            payload: {
              agent_id: spec.agent_id,
              reason: `probe_failed: ${probe.error_message ?? "unknown"}`,
              public_tier,
              probe_id,
            },
          });
          return;
        }

        const declineWith = async (reason: string) => {
          await ctx.runMutation(internal.lifecycle.log, {
            task_id: args.task_id,
            event_type: "bid_declined",
            payload: {
              agent_id: spec.agent_id,
              reason,
              public_tier,
              probe_id,
            },
          });
        };

        if (!bidOutcome.ok) {
          await declineWith(`error: ${bidOutcome.error}`);
          return;
        }
        if ("decline" in bidOutcome.decision) {
          await declineWith(bidOutcome.decision.reason);
          return;
        }
        const bid = bidOutcome.decision satisfies BidPayload;

        // ─── Plan screen: a bid must carry a plausible, task-specific plan.
        const screen = await assessPlanPlausibility(
          task.prompt,
          bid.capability_claim,
        );
        if (!screen.plausible) {
          await declineWith(`implausible_plan: ${screen.reason}`);
          return;
        }

        // Probe-passed live tiers carry full weight; demo-lane personas get a
        // near-zero weight — visible in the auction, ranked among themselves,
        // but never above any live bidder.
        const tierWeight =
          probe.status === "pass" &&
          (public_tier === "native-a2a" || public_tier === "a2a-bridge")
            ? 1.0
            : probe.status === "demo_lane"
              ? 0.05
              : 0;
        const score =
          (reputation / Math.max(0.01, bid.bid_price)) * tierWeight;
        const bid_id = await ctx.runMutation(internal.bids._insert, {
          task_id: args.task_id,
          agent_id: spec.agent_id,
          bid_price: bid.bid_price,
          capability_claim: bid.capability_claim,
          estimated_seconds: bid.estimated_seconds,
          score,
          plan_source: bid.plan_source,
        });
        await ctx.runMutation(internal.bidProbes._setBidId, {
          probe_id,
          bid_id,
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
            plan_source: bid.plan_source,
            bid_latency_ms: Date.now() - solicitStart,
            public_tier,
            probe_id,
          },
        });
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
    const allBids = (await ctx.runQuery(internal.bids._allForTask, {
      task_id: args.task_id,
    })) as Array<Doc<"bids">>;

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

    if (stripeCheckoutMode()) {
      const currency = stripeCurrency();
      await ctx.runMutation(internal.escrow._markPaymentRequired, {
        task_id: args.task_id,
        processor: "stripe",
        currency,
      });
      await ctx.runMutation(internal.tasks._setPaymentStatus, {
        task_id: args.task_id,
        payment_status: "requires_payment",
        status: "requires_payment",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "stripe_payment_required",
        payload: {
          seller_id: winner.agent_id,
          amount: price_paid,
          currency,
          mode: "checkout_manual_capture",
        },
      });
      return;
    }

    // Phase 4 — execution.
    await ctx.scheduler.runAfter(0, internal.auctions.execute, {
      task_id: args.task_id,
    });
  },
});

// ─── Phase 4: execution ──────────────────────────────────────────────────

export const execute = internalAction({
  args: {
    task_id: v.id("tasks"),
    // Agents that already failed execution on this task. Bounded failover:
    // when the winner fails, the auctioneer re-awards to the next-best bid
    // instead of failing the whole task (see catch block below).
    attempted_agent_ids: v.optional(v.array(v.string())),
  },
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
          a2a_endpoint: discoveredEntry.a2a_endpoint,
          a2a_agent_card_url: discoveredEntry.a2a_agent_card_url,
          a2a_api_key_env: discoveredEntry.a2a_api_key_env,
          homepage_url: discoveredEntry.homepage_url,
          discovered: true,
          discovery_source: discoveredEntry.discovery_source,
          discovered_for: discoveredEntry.discovered_for,
          tier: discoveredEntry.a2a_endpoint
            ? "a2a"
            : discoveredEntry.mcp_endpoint
              ? "mcp-forwarding"
              : "mock",
        });
      }
      const runner = getRunner(winner.agent_id as AgentId);
      const toolRecorder = makeToolCallRecorder(ctx, args.task_id, winner.agent_id);
      // 180s cap on execute. MCP-forwarding specialists run multi-round
      // tool-calling loops (6 rounds × ~30s each worst case for Reacher /
      // Nia), so 60s would force a timeout before they finish. Plain
      // (mock) specialists return well under this.
      const executeResult = await Promise.race([
        runner.execute(promptForExecution, task.task_type, {
          task_id: args.task_id,
          agent_id: winner.agent_id,
          toolRecorder,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("execution timeout (180s)")), 180_000),
        ),
      ]);
      const normalized = normalizeSpecialistOutput(executeResult.output);
      const provenance: SpecialistProvenance = finalizeProvenance(
        executeResult.provenance,
        toolRecorder.successfulCallIds(),
      );

      // A [FALLBACK] banner is not a deliverable. Fail-closed runners return
      // it with fallback_reason set when the remote leg didn't actually run —
      // throw so the failover below can route to the next bidder instead of
      // settling fallback text as a completed task.
      if (provenance.fallback_reason) {
        throw new Error(`specialist_fallback: ${provenance.fallback_reason}`);
      }

      // ─── Receipt rule: a task is only fulfilled when the winner produced
      // a real external session id, at least one observed event, and a
      // captured artifact. Anything less means we cannot prove the agent
      // actually did the work — fail the task honestly rather than mark
      // it complete on the strength of returned text alone.
      const receipt = await ctx.runQuery(
        internal.agentToolCalls._fulfilmentSummaryForTask,
        { task_id: args.task_id, agent_id: winner.agent_id },
      );
      const external_session_id =
        receipt.external_session_id ?? provenance.external_session_id;
      const artifact_present =
        receipt.artifact_present ||
        !!provenance.pr_url ||
        (normalized.text?.trim().length ?? 0) > 0;
      const events_observed_total = receipt.events_observed_total;

      const missing: string[] = [];
      if (!external_session_id) missing.push("external_session_id");
      if (events_observed_total <= 0) missing.push("events_observed");
      if (!artifact_present) missing.push("artifact_present");

      if (missing.length > 0) {
        // Throw to fall into the catch block below, which refunds escrow,
        // sets task status to failed, and writes execution_failed with the
        // structured reason.
        throw new Error(`partial_receipt: missing ${missing.join(", ")}`);
      }

      await ctx.runMutation(internal.tasks._setResult, {
        task_id: args.task_id,
        result: {
          text: normalized.text,
          agent_id: winner.agent_id,
          artifact: normalized.artifact,
          provenance,
        },
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "execution_complete",
        payload: {
          agent_id: winner.agent_id,
          length: normalized.text.length,
          successful_tool_call_count:
            provenance.successful_tool_call_count ?? 0,
          proof_level: provenance.proof_level ?? "none",
          external_session_id,
          events_observed: events_observed_total,
          artifact_present,
          pr_url: provenance.pr_url,
          pr_number: provenance.pr_number,
        },
      });

      // Phase 5 — judge.
      await ctx.scheduler.runAfter(0, internal.auctions.judge, {
        task_id: args.task_id,
      });
    } catch (err) {
      await cancelStripePaymentForTask(
        ctx,
        args.task_id,
        `execution_failed:${err instanceof Error ? err.message : String(err)}`,
      );
      await ctx.runMutation(internal.escrow._settle, {
        task_id: args.task_id,
        status: "refunded",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "execution_failed",
        payload: {
          agent_id: winner.agent_id,
          reason: err instanceof Error ? err.message : String(err),
        },
      });

      // ─── Failover: re-award to the next-best bidder instead of failing
      // the task outright. The A2A/MCP runners are fail-closed by design
      // ("the auctioneer should pick another bidder"), so honor that here.
      // Bounded to MAX_EXECUTION_ATTEMPTS total winners per task.
      const MAX_EXECUTION_ATTEMPTS = 3;
      const attempted = [
        ...(args.attempted_agent_ids ?? []),
        winner.agent_id,
      ];
      if (attempted.length < MAX_EXECUTION_ATTEMPTS) {
        const allBids = (await ctx.runQuery(internal.bids._allForTask, {
          task_id: args.task_id,
        })) as Array<Doc<"bids">>;
        const remaining = allBids
          .filter(
            (b) =>
              b.bid_price <= task.max_budget &&
              !attempted.includes(b.agent_id),
          )
          .sort((a, b) => b.score - a.score);
        if (remaining.length > 0) {
          const next = remaining[0];
          const price_paid =
            remaining.length >= 2 ? remaining[1].bid_price : next.bid_price;
          await ctx.runMutation(internal.escrow._lock, {
            task_id: args.task_id,
            buyer_id: task.posted_by || BUYER_ID,
            seller_id: next.agent_id,
            locked_amount: price_paid,
          });
          await ctx.runMutation(internal.tasks._setWinner, {
            task_id: args.task_id,
            winning_bid_id: next._id,
            price_paid,
          });
          await ctx.runMutation(internal.lifecycle.log, {
            task_id: args.task_id,
            event_type: "execution_failover",
            payload: {
              from_agent_id: winner.agent_id,
              to_agent_id: next.agent_id,
              attempt: attempted.length + 1,
              price_paid,
            },
          });
          if (stripeCheckoutMode()) {
            const currency = stripeCurrency();
            await ctx.runMutation(internal.escrow._markPaymentRequired, {
              task_id: args.task_id,
              processor: "stripe",
              currency,
            });
            await ctx.runMutation(internal.tasks._setPaymentStatus, {
              task_id: args.task_id,
              payment_status: "requires_payment",
              status: "requires_payment",
            });
            await ctx.runMutation(internal.lifecycle.log, {
              task_id: args.task_id,
              event_type: "stripe_payment_required",
              payload: {
                seller_id: next.agent_id,
                amount: price_paid,
                currency,
                mode: "checkout_manual_capture",
                reason: "execution_failover",
              },
            });
            return;
          }
          await ctx.scheduler.runAfter(0, internal.auctions.execute, {
            task_id: args.task_id,
            attempted_agent_ids: attempted,
          });
          return;
        }
      }

      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "failed",
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
        ? "This is the live Reacher launch workflow. The example creators in the generic campaign evidence are illustrative only — do not reject merely because the agent used different creators. Prefer live Reacher MCP evidence from tools such as list_shops_shops_get, creators_performance_creators_performance_post, and creators_list_creators_list_post. Accept if the output cites those live tool results and includes a creator shortlist, outreach drafts, sample notes, risk flags, and a 7-day launch plan."
        : null,
      buildTaskContext(task.prompt, task.task_type),
      task.output_schema
        ? `Required output schema:\n${JSON.stringify(task.output_schema, null, 2)}`
        : null,
      args.dispute_reason
        ? `Buyer dispute reason (re-evaluate with this in mind):\n${args.dispute_reason}`
        : null,
      `Agent output:\n${formatResultForJudge(task.result)}`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const judgeSystemPrompt = JUDGE_GENERAL_PROMPT;

    let verdict: JudgeVerdict;
    try {
      verdict = await Promise.race([
        callOpenAIJSON<JudgeVerdict>({
          systemPrompt: judgeSystemPrompt,
          userPrompt,
          maxTokens: 512,
          timeoutMs: 20_000,
          retries: 1,
          purpose: "judge",
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
    const lifecycle = (await ctx.runQuery(internal.lifecycle._forTask, {
      task_id: args.task_id,
    })) as Array<Doc<"lifecycle_events">>;
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
      await captureStripePaymentForTask(ctx, args.task_id);
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
      await cancelStripePaymentForTask(ctx, args.task_id, "judge_rejected");
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
