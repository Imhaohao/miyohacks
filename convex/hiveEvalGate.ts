"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getRunner,
  registerDiscoveredSpecialist,
} from "../lib/specialists/registry";
import { callClaudeJSON, CLAUDE_FAST_MODEL } from "../lib/anthropic";
import type {
  AgentId,
  BidPayload,
  ProbeResult,
  SpecialistConfig,
  SpecialistDecision,
} from "../lib/types";

const EVAL_PROMPT =
  "Summarize the three most important considerations when integrating a third-party payments API into an existing web application, and state which one you would verify first.";
const EVAL_TASK_TYPE = "general";

interface EvalReport {
  stages: {
    probe: {
      status: "pass" | "fail" | "demo_lane" | "skipped";
      duration_ms?: number;
      error?: string;
    };
    bid: {
      kind: "bid" | "decline" | "error";
      capability_claim?: string;
      error?: string;
    };
    grade: { pass?: boolean; reason?: string; grader_error?: string };
  };
  passed: boolean;
  completed_at: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs),
    ),
  ]);
}

function isDecline(decision: SpecialistDecision): boolean {
  return "decline" in decision && decision.decline === true;
}

function toSpecialistConfig(row: {
  agent_id: string;
  display_name: string;
  sponsor: string;
  capabilities: string[];
  system_prompt: string;
  cost_baseline: number;
  starting_reputation: number;
  one_liner: string;
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  a2a_auth_mode?: "none" | "card";
  homepage_url?: string;
  discovery_source?: "catalog" | "registry" | "synthesized" | "a2a";
  discovered_for?: string;
}): SpecialistConfig {
  return {
    agent_id: row.agent_id as AgentId,
    display_name: row.display_name,
    sponsor: row.sponsor,
    capabilities: row.capabilities,
    system_prompt: row.system_prompt,
    cost_baseline: row.cost_baseline,
    starting_reputation: row.starting_reputation,
    one_liner: row.one_liner,
    mcp_endpoint: row.mcp_endpoint,
    mcp_api_key_env: row.mcp_api_key_env,
    a2a_endpoint: row.a2a_endpoint,
    a2a_agent_card_url: row.a2a_agent_card_url,
    a2a_api_key_env: row.a2a_api_key_env,
    a2a_auth_mode: row.a2a_auth_mode,
    homepage_url: row.homepage_url,
    discovered: true,
    discovery_source: row.discovery_source,
    discovered_for: row.discovered_for,
    tier: row.a2a_endpoint
      ? "a2a"
      : row.mcp_endpoint
        ? "mcp-forwarding"
        : "mock",
  };
}

function baseReport(): EvalReport {
  return {
    stages: {
      probe: { status: "skipped" },
      bid: { kind: "error", error: "skipped" },
      grade: {},
    },
    passed: false,
    completed_at: Date.now(),
  };
}

function probeStage(probe: ProbeResult): EvalReport["stages"]["probe"] {
  const stage: EvalReport["stages"]["probe"] = {
    status: probe.status,
    duration_ms: probe.duration_ms,
  };
  if (probe.error_message) stage.error = probe.error_message;
  return stage;
}

function gradeStage(input: {
  pass: boolean;
  reason?: string;
  grader_error?: string;
}): EvalReport["stages"]["grade"] {
  if (input.grader_error) {
    return { pass: true, grader_error: input.grader_error };
  }
  const stage: EvalReport["stages"]["grade"] = { pass: input.pass };
  if (input.reason) stage.reason = input.reason;
  return stage;
}

async function gradeClaim(capabilityClaim: string): Promise<{
  pass: boolean;
  reason?: string;
  grader_error?: string;
}> {
  try {
    const grade = await callClaudeJSON<{ pass: boolean; reason: string }>({
      model: CLAUDE_FAST_MODEL,
      maxTokens: 256,
      timeoutMs: 20_000,
      retries: 0,
      systemPrompt:
        "You are a strict registration evaluator. Return JSON only with pass and reason. Pass only if the claim addresses third-party payments API integration specifically, contains at least two concrete steps, and is not a generic capability pitch.",
      userPrompt: JSON.stringify({
        eval_prompt: EVAL_PROMPT,
        capability_claim: capabilityClaim,
      }),
    });
    return { pass: Boolean(grade.pass), reason: grade.reason };
  } catch (err) {
    return { pass: true, grader_error: errorMessage(err) };
  }
}

export const runEvalGate = internalAction({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(
      internal.discoveredSpecialists._getByAgentId,
      { agent_id: args.agent_id },
    );
    if (!row) {
      console.log(
        `[hive-eval-gate] agent=${args.agent_id} passed=false reason=no discovered_specialists row`,
      );
      return null;
    }

    const cfg = toSpecialistConfig(row);
    const report = baseReport();
    let reason = "unknown";

    try {
      registerDiscoveredSpecialist(cfg);
      const runner = getRunner(args.agent_id as AgentId);

      if (cfg.tier === "mock" || !runner.probe) {
        reason = "no live endpoint";
        report.stages.probe = { status: "skipped", error: reason };
      } else {
        let probe: ProbeResult;
        try {
          probe = await withTimeout(
            runner.probe(EVAL_TASK_TYPE),
            15_000,
            "probe",
          );
          report.stages.probe = probeStage(probe);
        } catch (err) {
          reason = errorMessage(err);
          report.stages.probe = { status: "fail", error: reason };
        }

        if (report.stages.probe.status === "pass") {
          let decision: SpecialistDecision | null = null;
          try {
            decision = await withTimeout(
              runner.bid(EVAL_PROMPT, EVAL_TASK_TYPE),
              20_000,
              "bid",
            );
          } catch (err) {
            reason = errorMessage(err);
            report.stages.bid = { kind: "error", error: reason };
          }

          if (!decision) {
            report.passed = false;
          } else if (isDecline(decision)) {
            const declineReason =
              "reason" in decision && typeof decision.reason === "string"
                ? decision.reason
                : "declined fixed eval";
            reason = "declined fixed eval";
            report.stages.bid = {
              kind: "decline",
              error: declineReason,
            };
          } else {
            const bid = decision as BidPayload;
            report.stages.bid = {
              kind: "bid",
              capability_claim: bid.capability_claim,
            };
            const grade = await gradeClaim(bid.capability_claim);
            report.stages.grade = gradeStage(grade);
            report.passed = grade.pass;
            reason = grade.grader_error
              ? "grader transport error; fail-open"
              : grade.reason ?? (grade.pass ? "passed" : "failed grade");
          }
        } else {
          reason =
            report.stages.probe.error ??
            `probe ${report.stages.probe.status}`;
        }
      }
    } catch (err) {
      reason = errorMessage(err);
      report.stages.bid = { kind: "error", error: reason };
    }

    report.completed_at = Date.now();
    await ctx.runMutation(internal.hiveRegistryData._setEvalResult, {
      agent_id: args.agent_id,
      eval_status: report.passed ? "passed" : "failed",
      eval_report: report,
    });
    await ctx.runMutation(internal.hiveRegistryData._setEvalPassed, {
      agent_id: args.agent_id,
      eval_passed: report.passed,
    });
    console.log(
      `[hive-eval-gate] agent=${args.agent_id} passed=${report.passed} reason=${reason}`,
    );
    return null;
  },
});
