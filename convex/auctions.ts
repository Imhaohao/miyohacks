"use node";

import { internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  SPECIALISTS,
  getRunner,
  registerDiscoveredSpecialist,
} from "../lib/specialists/registry";
import { MCP_CATALOG } from "../lib/specialists/catalog";
import {
  AGENT_CONTACT_CATALOG,
  contactToSpecialistConfig,
} from "../lib/agent-contacts";
import type {
  AgentId,
  BidPayload,
  ExecutionPlanArtifact,
  ExecutionPlanProvenance,
  ExecutionPlanRequest,
  ExecutionPlanSource,
  ExecutionArtifact,
  JudgeVerdict,
  SpecialistConfig,
  SpecialistOutput,
} from "../lib/types";
import { callOpenAIJSON } from "../lib/openai";
import {
  fallbackExecutionPlan,
  makeDefaultPlanFn,
  normalizeExecutionPlan,
} from "../lib/execution-plan";
import { probeSpecialistConnection } from "../lib/specialists/connection-runtime";
import { classifyAgentExecution } from "../lib/agent-execution-status";
import {
  buildTaskContext,
  isCreatorCommerceTask,
  isImplementationTask,
} from "../lib/campaign-context";
import {
  clamp01,
  computeAuctionValue,
  qualityAdjustedVickreyPrice,
} from "../lib/auction-value";
import {
  roleForAgent,
  roleForSpecialist,
} from "../lib/agent-roles";
import { isSelectableExecutorBid } from "../lib/auction-selection";
import { configuredConnectionAvailability } from "../lib/specialists/connection-runtime";

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

function formatResultForJudge(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    return JSON.stringify(result, null, 2);
  }
  return JSON.stringify(result);
}

type ToolAvailability = NonNullable<BidPayload["tool_availability"]>;

function checkToolAvailability(spec: SpecialistConfig): ToolAvailability {
  return configuredConnectionAvailability(spec);
}

function isHardUnavailable(spec: SpecialistConfig, availability: ToolAvailability) {
  return (
    availability.status === "missing" &&
    (Boolean(spec.mcp_endpoint) ||
      Boolean(spec.a2a_endpoint) ||
      Boolean(spec.a2a_agent_card_url) ||
      Boolean(spec.mcp_api_key_env) ||
      spec.agent_id === "vercel-v0")
  );
}

function inferTaskFitScore(args: {
  agent_id: string;
  shortlistScore?: number;
  recommended: Set<string>;
  task_type: string;
}): number {
  if (typeof args.shortlistScore === "number") return clamp01(args.shortlistScore);
  if (args.recommended.has(args.agent_id)) return 0.82;
  if (args.task_type === "reacher-live-launch" && args.agent_id === "reacher-social") {
    return 1;
  }
  return 0.58;
}

function reliabilityFromAgent(agent?: {
  reputation_score?: number;
  total_tasks_completed?: number;
  total_disputes_lost?: number;
}) {
  if (!agent) return 0.65;
  const completed = agent.total_tasks_completed ?? 0;
  const disputes = agent.total_disputes_lost ?? 0;
  if (completed + disputes === 0) return clamp01(agent.reputation_score ?? 0.65);
  return clamp01(completed / (completed + disputes));
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
    )) as Doc<"discovered_specialists">[];
    const discoveredConfigs: SpecialistConfig[] = discovered.map((d) => {
      const cfg: SpecialistConfig = {
        agent_id: d.agent_id,
        display_name: d.display_name,
        sponsor: d.sponsor,
        agent_role: d.agent_role,
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
        agent_role: "executor",
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
          agent_role: c.agent_role,
          capabilities: c.capabilities,
          system_prompt: c.system_prompt,
          cost_per_task_estimate: c.cost_baseline,
          starting_reputation: c.starting_reputation,
        }),
      ),
    );

    // The reacher-live-launch demo bypasses the open auction and routes
    // straight to reacher-social. Other tasks invite only the specialists from
    // the Hyperspell/Nia routing packet. This prevents a creator-commerce
    // specialist from winning a SaaS engineering task just because it can
    // produce a polished but unrelated artifact.
    const shortlist = (await ctx.runQuery(internal.agentShortlists._forTask, {
      task_id: args.task_id,
    })) as Doc<"agent_shortlists">[];
    const shortlistedIds = new Set(shortlist.map((item) => item.agent_id));
    const shortlistScores = new Map<string, number>(
      shortlist.map((item) => [item.agent_id, item.score] as const),
    );
    const contactConfigs: SpecialistConfig[] = AGENT_CONTACT_CATALOG.filter((contact) =>
      shortlistedIds.has(contact.agent_id),
    ).map((contact) => {
      const cfg = contactToSpecialistConfig(contact);
      registerDiscoveredSpecialist(cfg);
      return cfg;
    });
    await Promise.allSettled(
      contactConfigs.map((c) =>
        ctx.runMutation(internal.agents._ensureAgent, {
          agent_id: c.agent_id,
          display_name: c.display_name,
          sponsor: c.sponsor,
          agent_role: c.agent_role,
          capabilities: c.capabilities,
          system_prompt: c.system_prompt,
          cost_per_task_estimate: c.cost_baseline,
          starting_reputation: c.starting_reputation,
        }),
      ),
    );

    const recommended = new Set<string>(
      taskContext?.routing.recommended_specialists ?? [],
    );
    const roster = [...SPECIALISTS, ...discoveredConfigs, ...catalogConfigs];
    const fullRoster = [...roster, ...contactConfigs].filter(
      (spec, index, list) =>
        list.findIndex((candidate) => candidate.agent_id === spec.agent_id) === index,
    );
    const invitedSpecialists: SpecialistConfig[] =
      task.task_type === "reacher-live-launch"
        ? SPECIALISTS.filter((spec) => spec.agent_id === "reacher-social")
        : shortlistedIds.size > 0
          ? fullRoster.filter((spec) => shortlistedIds.has(spec.agent_id))
        : recommended.size > 0
          ? fullRoster.filter((spec) => recommended.has(spec.agent_id))
          : fullRoster;

    await Promise.allSettled(
      invitedSpecialists.map(async (spec) => {
        const runner = getRunner(spec.agent_id as AgentId);
        const agent = await ctx.runQuery(internal.agents._getByAgentId, {
          agent_id: spec.agent_id,
        });
        const reputation = agent?.reputation_score ?? spec.starting_reputation;
        const toolAvailability = checkToolAvailability(spec);

        if (isHardUnavailable(spec, toolAvailability)) {
          await ctx.runMutation(internal.lifecycle.log, {
            task_id: args.task_id,
            event_type: "bid_declined",
            payload: {
              agent_id: spec.agent_id,
              reason: toolAvailability.reason ?? "required tool is unavailable",
              tool_availability: toolAvailability,
            },
          });
          return;
        }

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
          const bidAvailability = bid.tool_availability ?? toolAvailability;
          const reputationSummary = await ctx.runQuery(
            internal.reputationDimensions._summaryForAgent,
            { agent_id: spec.agent_id },
          );
          const taskFitScore = inferTaskFitScore({
            agent_id: spec.agent_id,
            shortlistScore: shortlistScores.get(spec.agent_id),
            recommended,
            task_type: task.task_type,
          });
          const reliabilityScore = reliabilityFromAgent(agent ?? undefined);
          const acceptanceRate = clamp01(
            reputationSummary.tasks > 0
              ? reputationSummary.acceptance_rate
              : reliabilityScore,
          );
          const availabilityScore =
            bidAvailability.status === "available"
              ? 1
              : bidAvailability.status === "manual"
                ? 0.82
                : bidAvailability.status === "mock"
                  ? 0.62
                  : 0;
          const value = computeAuctionValue({
            taskFitScore,
            historicalQuality: clamp01(
              reputationSummary.tasks > 0 ? reputationSummary.quality : reputation,
            ),
            acceptanceRate,
            reliabilityScore,
            speedScore: clamp01(reputationSummary.speed),
            estimateAccuracy: clamp01(reputationSummary.estimate),
            availabilityScore,
            bidPrice: bid.bid_price,
            estimatedSeconds: bid.estimated_seconds,
            taskType: task.task_type,
          });
          const score = value.valueScore;
          const bid_id = await ctx.runMutation(internal.bids._insert, {
            task_id: args.task_id,
            agent_id: spec.agent_id,
            agent_role: bid.agent_role ?? roleForSpecialist(spec),
            bid_price: bid.bid_price,
            capability_claim: bid.capability_claim,
            estimated_seconds: bid.estimated_seconds,
            score,
            task_fit_score: taskFitScore,
            historical_quality: clamp01(
              reputationSummary.tasks > 0 ? reputationSummary.quality : reputation,
            ),
            acceptance_rate: acceptanceRate,
            reliability_score: reliabilityScore,
            speed_score: clamp01(reputationSummary.speed),
            estimate_accuracy: clamp01(reputationSummary.estimate),
            availability_score: availabilityScore,
            expected_quality: value.expectedQuality,
            latency_penalty: value.latencyPenalty,
            effective_price: value.effectivePrice,
            value_score: value.valueScore,
            execution_preview:
              bid.execution_preview ??
              `Plan preview: ${bid.capability_claim} Estimated ${bid.estimated_seconds}s before delivery.`,
            tool_availability: bidAvailability,
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
              tool_availability: bidAvailability,
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
    const allBids = (await ctx.runQuery(internal.bids._allForTask, {
      task_id: args.task_id,
    })) as Doc<"bids">[];

    const visibleBids = allBids.filter(
      (b) =>
        b.bid_price <= task.max_budget &&
        (b.tool_availability?.status ?? "missing") !== "missing",
    );

    if (visibleBids.length === 0) {
      await ctx.runMutation(internal.payments._refundTaskReservation, {
        task_id: args.task_id,
        buyer_id: task.posted_by || BUYER_ID,
        amount: task.max_budget,
        reason: "auction failed: no valid bids under budget",
      });
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

    const executorBids = visibleBids.filter((b) =>
      isSelectableExecutorBid(b, task.max_budget),
    );

    if (executorBids.length === 0) {
      await ctx.runMutation(internal.payments._refundTaskReservation, {
        task_id: args.task_id,
        buyer_id: task.posted_by || BUYER_ID,
        amount: task.max_budget,
        reason: "auction failed: no executable bids under budget",
      });
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "failed",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "auction_failed",
        payload: {
          reason: "no executable bids under budget",
          all_bids: allBids,
        },
      });
      return;
    }

    // Sort by expected value, not raw cheapness. `score` remains populated for
    // backwards compatibility, but new bids use value_score as the canonical
    // ranking signal.
    const sortedExecutors = [...executorBids].sort(
      (a, b) => (b.value_score ?? b.score) - (a.value_score ?? a.score),
    );
    const supportingBids = visibleBids
      .filter((b) => !isSelectableExecutorBid(b, task.max_budget))
      .sort((a, b) => (b.value_score ?? b.score) - (a.value_score ?? a.score));
    const sorted = [...sortedExecutors, ...supportingBids];
    const winner = sortedExecutors[0];
    const runnerUp = sortedExecutors[1];
    const price_paid = qualityAdjustedVickreyPrice({
      winnerExpectedQuality: winner.expected_quality ?? winner.score * winner.bid_price,
      runnerUpValueScore: runnerUp?.value_score ?? runnerUp?.score,
      winnerBidPrice: winner.bid_price,
      maxBudget: task.max_budget,
    });
    const serializeBid = (b: typeof winner) => ({
      bid_id: b._id,
      agent_id: b.agent_id,
      agent_role: roleForAgent(b.agent_id, b.agent_role),
      bid_price: b.bid_price,
      score: b.value_score ?? b.score,
      value_score: b.value_score ?? b.score,
      capability_claim: b.capability_claim,
      estimated_seconds: b.estimated_seconds,
      task_fit_score: b.task_fit_score,
      historical_quality: b.historical_quality,
      acceptance_rate: b.acceptance_rate,
      reliability_score: b.reliability_score,
      speed_score: b.speed_score,
      estimate_accuracy: b.estimate_accuracy,
      availability_score: b.availability_score,
      expected_quality: b.expected_quality,
      latency_penalty: b.latency_penalty,
      effective_price: b.effective_price,
      execution_preview: b.execution_preview,
      tool_availability: b.tool_availability,
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
        bids: sorted.map(serializeBid),
        top_3: sortedExecutors.slice(0, 3).map(serializeBid),
        support_bids: supportingBids.map(serializeBid),
        winner: serializeBid(winner),
        vickrey: {
          winner_bid_price: winner.bid_price,
          runner_up_value_score: runnerUp?.value_score ?? runnerUp?.score,
          clearing_price: price_paid,
          price_paid,
          rule:
            sortedExecutors.length >= 2
              ? "quality_adjusted_second_price"
              : "degenerate_single_bid",
        },
      },
    });
    await ctx.scheduler.runAfter(0, internal.auctions.prepareExecutionPlan, {
      task_id: args.task_id,
    });
  },
});

// ─── Phase 4a: buyer-review execution plan ───────────────────────────────

const SPECIALIST_PLAN_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms),
    ),
  ]);
}

export const prepareExecutionPlan = internalAction({
  args: {
    task_id: v.id("tasks"),
    revision_feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    if (!task.winning_bid_id) {
      throw new Error("prepareExecutionPlan called without a winning bid");
    }
    const winner = await ctx.runQuery(internal.bids._get, {
      bid_id: task.winning_bid_id,
    });
    const taskContext = await ctx.runQuery(internal.taskContexts._latestForTask, {
      task_id: args.task_id,
    });

    // Resolve the runner so plans are written by the winning specialist (in its
    // own voice + with its own backing system) rather than by a generic
    // plan-writer prompt that just *mentions* the agent's name.
    let runner: ReturnType<typeof getRunner> | undefined;
    let runnerConfig: SpecialistConfig | undefined;
    let executionStatus = classifyAgentExecution({ agent_id: winner.agent_id });
    try {
      runner = getRunner(winner.agent_id as AgentId);
      runnerConfig = runner.config;
      executionStatus = classifyAgentExecution(runnerConfig);
    } catch {
      // Discovered specialists that haven't been hydrated into this process
      // fall through with a synthetic config below.
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "execution_plan_started",
      payload: {
        agent_id: winner.agent_id,
        revision: Boolean(args.revision_feedback),
        execution_status: executionStatus,
      },
    });

    const planRequest: ExecutionPlanRequest = {
      prompt: task.prompt,
      taskType: task.task_type,
      taskContext: taskContext?.prompt_addendum,
      revisionFeedback: args.revision_feedback,
      estimatedSeconds: winner.estimated_seconds,
      bidPrice: winner.bid_price,
    };

    let plan: ExecutionPlanArtifact;
    let source: ExecutionPlanSource = "fallback_generic";
    let probeStatus: ExecutionPlanProvenance["probe_status"] = "skipped";
    let provenanceNote: string | undefined;

    if (runner && runnerConfig) {
      // Probe so we can surface honestly whether the specialist's backing
      // system was reachable when the plan was drafted. Probe failures do not
      // block plan generation — they just downgrade the provenance.
      try {
        const probe = await probeSpecialistConnection(runnerConfig);
        probeStatus = probe.status;
        if (probe.status !== "available") {
          provenanceNote = `probe: ${probe.reason}`;
        }
      } catch (err) {
        probeStatus = "unreachable";
        provenanceNote = err instanceof Error ? err.message : String(err);
      }

      const planFn = runner.plan ?? makeDefaultPlanFn(runnerConfig);
      const usedRunnerOverride = Boolean(runner.plan);

      try {
        const raw = await withTimeout(
          Promise.resolve(planFn(planRequest)),
          SPECIALIST_PLAN_TIMEOUT_MS,
          usedRunnerOverride ? "specialist plan" : "default plan",
        );
        plan = normalizeExecutionPlan({
          agent_id: winner.agent_id,
          prompt: task.prompt,
          estimated_seconds: winner.estimated_seconds,
          raw,
          revisionFeedback: args.revision_feedback,
        });
        source = usedRunnerOverride ? "specialist_runner" : "default_llm";
      } catch (err) {
        plan = fallbackExecutionPlan({
          agent_id: winner.agent_id,
          prompt: task.prompt,
          estimated_seconds: winner.estimated_seconds,
          revisionFeedback: args.revision_feedback,
        });
        source = "fallback_generic";
        provenanceNote = err instanceof Error ? err.message : String(err);
      }
    } else {
      plan = fallbackExecutionPlan({
        agent_id: winner.agent_id,
        prompt: task.prompt,
        estimated_seconds: winner.estimated_seconds,
        revisionFeedback: args.revision_feedback,
      });
      source = "fallback_generic";
      provenanceNote = "winning specialist runner not resolvable in this process";
    }

    const provenance: ExecutionPlanProvenance = {
      source,
      agent_id: winner.agent_id,
      execution_status: executionStatus,
      probe_status: probeStatus,
      ...(provenanceNote ? { note: provenanceNote } : {}),
    };
    plan = { ...plan, produced_by: provenance };

    const plan_id = await ctx.runMutation(internal.executionPlans._upsert, {
      task_id: args.task_id,
      agent_id: winner.agent_id,
      status: "pending",
      plan,
      feedback: args.revision_feedback,
    });
    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "plan_review",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "execution_plan_ready",
      payload: {
        plan_id,
        agent_id: winner.agent_id,
        revision: Boolean(args.revision_feedback),
        title: plan.title,
        produced_by: provenance,
      },
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
          agent_role: discoveredEntry.agent_role,
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
      const latestPlan = await ctx.runQuery(
        internal.executionPlans._latestForTask,
        { task_id: args.task_id },
      );
      const planAcceptanceCriteria =
        Array.isArray(latestPlan?.plan?.acceptance_criteria)
          ? latestPlan.plan.acceptance_criteria.filter(
              (item: unknown): item is string => typeof item === "string",
            )
          : undefined;
      // 180s cap on execute. MCP-forwarding specialists run multi-round
      // tool-calling loops (6 rounds × ~30s each worst case for Reacher /
      // Nia), so 60s would force a timeout before they finish. Plain
      // (mock) specialists return well under this.
      const result = await Promise.race([
        runner.execute(promptForExecution, task.task_type, {
          task_id: args.task_id,
          target_repo: task.target_repo,
          target_branch: task.target_branch,
          acceptance_criteria: planAcceptanceCriteria,
        }),
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
      const prUrlMatch =
        typeof normalized.text === "string"
          ? normalized.text.match(/\bhttps:\/\/github\.com\/[^\s)]+\/pull\/\d+\b/)
          : null;
      if (prUrlMatch && winner.agent_id === "codex-writer") {
        await ctx.runMutation(internal.lifecycle.log, {
          task_id: args.task_id,
          event_type: "codex_pr_opened",
          payload: {
            agent_id: winner.agent_id,
            pr_url: prUrlMatch[0],
          },
        });
        await ctx
          .runAction(internal.contextEnrichment.recordCodexPr, {
            task_id: args.task_id,
            pr_url: prUrlMatch[0],
          })
          .catch(() => undefined);
      }

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

const JUDGE_IMPLEMENTATION_PLAN_PROMPT = `You are an impartial judge for a software/product execution marketplace. The task may have two valid artifact shapes:
1. A pre-execution implementation_plan artifact for buyer approval.
2. A post-approval execution result that reports actual repo edits, changed files, verification commands, and blockers.

Output JSON only:
{ "verdict": "accept" | "reject", "reasoning": "<one paragraph>", "quality_score": <0.0-1.0> }

Be strict but fair. If the output is a plan, accept only if it directly addresses the requested product/software change, identifies relevant context relay needs, names concrete implementation surfaces, preserves critical constraints, asks useful refinement questions, and defines acceptance criteria. If the output is an execution result, accept only if it is specific to the user's requested repo change, names actual changed files or explicitly explains why no edit was safe, includes verification evidence, and avoids unrelated template drift. Reject if it drifts into an unrelated domain, ignores the user's actual request, invents repo facts, or claims code was changed without file/diff evidence.`;

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
      `Agent output:\n${formatResultForJudge(task.result)}`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const judgeSystemPrompt = isCreatorCommerceTask(task.prompt, task.task_type)
      ? JUDGE_CAMPAIGN_PROMPT
      : isImplementationTask(task.prompt, task.task_type)
        ? JUDGE_IMPLEMENTATION_PLAN_PROMPT
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
    const lifecycle = (await ctx.runQuery(internal.lifecycle._forTask, {
      task_id: args.task_id,
    })) as Doc<"lifecycle_events">[];
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
