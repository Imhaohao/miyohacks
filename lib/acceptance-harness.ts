// Acceptance harness: runs every catalog sponsor agent through its canonical
// in-domain task and out-of-domain task, then buckets each into a readiness
// state. The output is consumed by:
//   - tests/acceptance-harness.test.ts (machinery + rubric mode)
//   - the admin readiness dashboard (live mode snapshot)
//   - scripts/acceptance-run.ts (CLI for live-mode runs)
//
// Design: the harness never mutates Convex itself. Persistence is the caller's
// job. That keeps the harness usable offline, in CI, and from scripts that
// don't want to spin up a Convex action context.

import {
  ACCEPTANCE_FIXTURES,
  fixtureFor,
  missingEnv,
  type AcceptanceFixture,
  type AcceptanceTaskFixture,
} from "./acceptance-fixtures";
import { runJudge } from "./judge";
import { rubricVerdict } from "./judge-rubrics";
import { SPECIALISTS, getRunner } from "./specialists/registry";
import type {
  AgentId,
  JudgeVerdict,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistOutput,
  SpecialistRunner,
} from "./types";

/** Per-direction outcome (in_domain or out_of_domain). */
export type DirectionState =
  /** Bid + execute + judge all passed. */
  | "accepted"
  /** Bid + execute, but judge rejected the artifact. */
  | "rejecting"
  /** Runner declined for a real "wrong specialty" reason (bad for in_domain, good for out_of_domain). */
  | "declined_in_domain"
  /** Runner correctly declined an out-of-domain task. */
  | "declined_correctly"
  /** Runner accepted an out-of-domain task it should not have. */
  | "over_bid"
  /** Runner's required env vars are not set. */
  | "blocked_credential"
  /** Agent is endpoint-gated and no A2A endpoint is configured. */
  | "blocked_endpoint"
  /** Vendor returned 429/5xx/timeout/unreachable — not the agent's fault. */
  | "blocked_provider"
  /** Runner threw during bid/execute/judge. */
  | "error"
  /** No fixture defined for this agent. */
  | "untested";

/** Roll-up state for the agent across both directions. */
export type AgentReadiness =
  /** in_domain accepted AND out_of_domain declined correctly. */
  | "ready"
  /** Agent is correctly gated by credentials/endpoint and behaves once configured. */
  | "blocked"
  /** in_domain rejected/declined wrongly OR out_of_domain bid wrongly. */
  | "needs_fix"
  /** No fixture or runner missing. */
  | "untested";

export interface DirectionResult {
  state: DirectionState;
  reason?: string;
  bid?: SpecialistDecision;
  output?: SpecialistOutput;
  verdict?: JudgeVerdict;
  duration_ms: number;
}

export interface AgentReadinessRecord {
  agent_id: AgentId;
  display_name: string;
  sponsor: string;
  readiness: AgentReadiness;
  in_domain: DirectionResult;
  out_of_domain: DirectionResult;
  fixture?: AcceptanceFixture;
  notes?: string;
}

export interface HarnessRunOptions {
  /** Subset of agents to run. Defaults to every fixture-backed agent. */
  agents?: AgentId[];
  /**
   * "rubric" runs the offline structural rubric (no OpenAI). "llm" calls the
   * real judge. Defaults to "rubric".
   */
  judgeMode?: "rubric" | "llm";
  /**
   * Optional runner override (used by tests to inject fakes without touching
   * the real registry).
   */
  getRunner?: (agent_id: AgentId) => SpecialistRunner;
  /**
   * Optional config lookup. Defaults to scanning SPECIALISTS + fixtures.
   */
  getConfig?: (agent_id: AgentId) => SpecialistConfig | undefined;
}

export interface HarnessSnapshot {
  generated_at: number;
  judge_mode: "rubric" | "llm";
  agents: AgentReadinessRecord[];
  summary: {
    total: number;
    ready: number;
    blocked: number;
    needs_fix: number;
    untested: number;
  };
}

// ─── classification ──────────────────────────────────────────────────────────

const CREDENTIAL_HINTS = [
  "api_key",
  "api key",
  "is not configured",
  "is not set",
  "not configured",
  "missing",
  "needs github_token",
  "needs openai_api_key",
  "credentials are missing",
  "401",
  "unauthorized",
  "invalid api key",
  "forbidden",
  "403",
];

const ENDPOINT_HINTS = [
  "no real a2a endpoint",
  "no real mcp or a2a execution connection",
  "a2a connection unavailable",
  "a2a endpoint",
  "endpoint not configured",
];

const PROVIDER_HINTS = [
  "429",
  "rate limit",
  "rate-limit",
  "rate_limit",
  "too_many_requests",
  "too many requests",
  "quota",
  "daily message limit",
  "daily limit",
  "fetch failed",
  "etimedout",
  "econnreset",
  "econnrefused",
  "tool discovery is unavailable",
  "tool discovery unavailable",
  "service unavailable",
  "gateway timeout",
  "bad gateway",
  "500 internal",
  "502 bad",
  "503 service",
  "504 gateway",
];

function classifyByHints(
  reason: string,
  fixture: AcceptanceFixture,
): { state: DirectionState; reason: string } {
  const lower = reason.toLowerCase();
  if (ENDPOINT_HINTS.some((needle) => lower.includes(needle))) {
    return { state: "blocked_endpoint", reason };
  }
  if (PROVIDER_HINTS.some((needle) => lower.includes(needle))) {
    return { state: "blocked_provider", reason };
  }
  if (CREDENTIAL_HINTS.some((needle) => lower.includes(needle))) {
    return { state: "blocked_credential", reason };
  }
  if (fixture.endpoint_gated) {
    return { state: "blocked_endpoint", reason };
  }
  return { state: "declined_in_domain", reason };
}

function classifyDecline(reason: string, fixture: AcceptanceFixture): {
  state: DirectionState;
  reason: string;
} {
  return classifyByHints(reason, fixture);
}

function isDecline(decision: SpecialistDecision): decision is { decline: true; reason: string } {
  return "decline" in decision && decision.decline === true;
}

// ─── core runners ────────────────────────────────────────────────────────────

async function runDirection(args: {
  runner: SpecialistRunner;
  config: SpecialistConfig;
  task: AcceptanceTaskFixture;
  fixture: AcceptanceFixture;
  direction: "in_domain" | "out_of_domain";
  judgeMode: "rubric" | "llm";
}): Promise<DirectionResult> {
  const { runner, task, fixture, direction, judgeMode } = args;
  const started = Date.now();

  // Pre-check: required env missing → blocked_credential (skip the call so
  // runners that throw on missing env never get to throw).
  if (direction === "in_domain") {
    const missing = missingEnv(fixture);
    if (missing.length) {
      return {
        state: "blocked_credential",
        reason: `Missing env: ${missing.join(", ")}`,
        duration_ms: Date.now() - started,
      };
    }
    if (fixture.endpoint_gated) {
      const hasEndpoint = Boolean(
        runner.config.a2a_endpoint || runner.config.a2a_agent_card_url,
      );
      if (!hasEndpoint) {
        return {
          state: "blocked_endpoint",
          reason: "Agent is endpoint-gated and no A2A endpoint is configured.",
          duration_ms: Date.now() - started,
        };
      }
    }
  }

  let bid: SpecialistDecision;
  try {
    bid = await runner.bid(task.prompt, task.taskType);
  } catch (err) {
    return {
      state: "error",
      reason: `bid() threw: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - started,
    };
  }

  if (isDecline(bid)) {
    if (direction === "out_of_domain") {
      return {
        state: "declined_correctly",
        reason: bid.reason,
        bid,
        duration_ms: Date.now() - started,
      };
    }
    const classified = classifyDecline(bid.reason, fixture);
    return {
      ...classified,
      bid,
      duration_ms: Date.now() - started,
    };
  }

  // Bid was accepted.
  if (direction === "out_of_domain") {
    return {
      state: "over_bid",
      reason: "Runner bid on a task outside its specialty.",
      bid,
      duration_ms: Date.now() - started,
    };
  }

  let output: SpecialistOutput;
  try {
    output = await runner.execute(task.prompt, task.taskType, task.opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Re-bucket vendor / credential / endpoint errors that surface at execute
    // time so they look the same as the bid-time decline path. The dashboard
    // shows "fix your key" vs "vendor is down" vs "your runner is broken."
    const classified = classifyByHints(message, fixture);
    if (classified.state !== "declined_in_domain") {
      return {
        state: classified.state,
        reason: message,
        bid,
        duration_ms: Date.now() - started,
      };
    }
    return {
      state: "error",
      reason: `execute() threw: ${message}`,
      bid,
      duration_ms: Date.now() - started,
    };
  }

  let verdict: JudgeVerdict;
  if (judgeMode === "llm") {
    verdict = await runJudge({
      prompt: task.prompt,
      taskType: task.taskType,
      result: output,
    });
  } else {
    const rubric = rubricVerdict({
      prompt: task.prompt,
      taskType: task.taskType,
      result: output,
    });
    verdict = {
      verdict: rubric.verdict,
      reasoning: rubric.reasoning,
      quality_score: rubric.quality_score,
    };
  }

  return {
    state: verdict.verdict === "accept" ? "accepted" : "rejecting",
    reason: verdict.reasoning,
    bid,
    output,
    verdict,
    duration_ms: Date.now() - started,
  };
}

function rollUp(inDir: DirectionResult, outDir: DirectionResult): AgentReadiness {
  if (inDir.state === "untested") return "untested";
  if (
    inDir.state === "blocked_credential" ||
    inDir.state === "blocked_endpoint" ||
    inDir.state === "blocked_provider"
  ) {
    return "blocked";
  }
  if (inDir.state === "accepted" && outDir.state === "declined_correctly") {
    return "ready";
  }
  return "needs_fix";
}

// ─── public entry points ─────────────────────────────────────────────────────

/** Run the harness for a single agent. Always returns a record (no throws). */
export async function runHarnessForAgent(
  agent_id: AgentId,
  opts: HarnessRunOptions = {},
): Promise<AgentReadinessRecord> {
  const judgeMode = opts.judgeMode ?? "rubric";
  const resolveConfig = opts.getConfig
    ?? ((id: AgentId) => SPECIALISTS.find((s) => s.agent_id === id));
  const resolveRunner = opts.getRunner ?? getRunner;

  const fixture = fixtureFor(agent_id);
  const config = resolveConfig(agent_id);
  if (!fixture || !config) {
    const untested: DirectionResult = {
      state: "untested",
      reason: fixture
        ? `No specialist config registered for ${agent_id}.`
        : `No acceptance fixture defined for ${agent_id}.`,
      duration_ms: 0,
    };
    return {
      agent_id,
      display_name: config?.display_name ?? String(agent_id),
      sponsor: config?.sponsor ?? "unknown",
      readiness: "untested",
      in_domain: untested,
      out_of_domain: untested,
      fixture,
      notes: fixture?.notes,
    };
  }

  let runner: SpecialistRunner;
  try {
    runner = resolveRunner(agent_id);
  } catch (err) {
    const errored: DirectionResult = {
      state: "error",
      reason: `getRunner threw: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
    return {
      agent_id,
      display_name: config.display_name,
      sponsor: config.sponsor,
      readiness: "needs_fix",
      in_domain: errored,
      out_of_domain: errored,
      fixture,
      notes: fixture.notes,
    };
  }

  const [inResult, outResult] = await Promise.all([
    runDirection({
      runner,
      config,
      task: fixture.in_domain,
      fixture,
      direction: "in_domain",
      judgeMode,
    }),
    runDirection({
      runner,
      config,
      task: fixture.out_of_domain,
      fixture,
      direction: "out_of_domain",
      judgeMode,
    }),
  ]);

  return {
    agent_id,
    display_name: config.display_name,
    sponsor: config.sponsor,
    readiness: rollUp(inResult, outResult),
    in_domain: inResult,
    out_of_domain: outResult,
    fixture,
    notes: fixture.notes,
  };
}

/** Run the harness for every fixture-backed agent (or a provided subset). */
export async function runHarness(
  opts: HarnessRunOptions = {},
): Promise<HarnessSnapshot> {
  const judgeMode = opts.judgeMode ?? "rubric";
  const agentList =
    opts.agents ?? ACCEPTANCE_FIXTURES.map((f) => f.agent_id);

  const records = await Promise.all(
    agentList.map((id) => runHarnessForAgent(id, opts)),
  );

  return {
    generated_at: Date.now(),
    judge_mode: judgeMode,
    agents: records,
    summary: {
      total: records.length,
      ready: records.filter((r) => r.readiness === "ready").length,
      blocked: records.filter((r) => r.readiness === "blocked").length,
      needs_fix: records.filter((r) => r.readiness === "needs_fix").length,
      untested: records.filter((r) => r.readiness === "untested").length,
    },
  };
}
