import { niaContext, NIA_CONTEXT_CONFIG } from "./nia-context";
import {
  hyperspellBrain,
  HYPERSPELL_BRAIN_CONFIG,
} from "./hyperspell-brain";
import {
  tensorlakeExec,
  TENSORLAKE_EXEC_CONFIG,
} from "./tensorlake-exec";
import { codexWriter, CODEX_WRITER_CONFIG } from "./codex-writer";
import { devinEngineer, DEVIN_ENGINEER_CONFIG } from "./devin-engineer";
import { reacherSocial, REACHER_SOCIAL_CONFIG } from "./reacher-social";
import { vercelV0, VERCEL_V0_CONFIG } from "./vercel-v0";
import {
  insforgeBackend,
  INSFORGE_BACKEND_CONFIG,
} from "./insforge-backend";
import { asideBrowser, ASIDE_BROWSER_CONFIG } from "./aside-browser";
import {
  convexRealtime,
  CONVEX_REALTIME_CONFIG,
} from "./convex-realtime";
import { makeMcpForwardingSpecialist } from "./mcp-forwarding";
import { makeA2AForwardingSpecialist } from "./a2a-forwarding";
import { makeSandboxA2ASpecialist } from "./sandbox-a2a-runner";
import {
  effectiveExecutionStatus,
  isSandboxA2AEnabled,
} from "../agent-execution-status";
import type {
  SpecialistConfig,
  SpecialistRunner,
  AgentId,
  DeclineDecision,
} from "../types";

/**
 * Canonical v0 Agent Auction Protocol roster: the five original sponsor
 * specialists from the technical spec.
 */
export const CANONICAL_V0_SPECIALISTS: SpecialistConfig[] = [
  NIA_CONTEXT_CONFIG,
  HYPERSPELL_BRAIN_CONFIG,
  TENSORLAKE_EXEC_CONFIG,
  CODEX_WRITER_CONFIG,
  DEVIN_ENGINEER_CONFIG,
];

/**
 * Demo and post-spec specialists used to prove richer workflows. These remain
 * eligible where configured, but are labeled separately from the canonical
 * v0 protocol roster in public registry surfaces.
 */
export const DEMO_EXTENSION_SPECIALISTS: SpecialistConfig[] = [
  REACHER_SOCIAL_CONFIG,
  VERCEL_V0_CONFIG,
  INSFORGE_BACKEND_CONFIG,
  ASIDE_BROWSER_CONFIG,
  CONVEX_REALTIME_CONFIG,
];

export const SPECIALISTS: SpecialistConfig[] = [
  ...CANONICAL_V0_SPECIALISTS,
  ...DEMO_EXTENSION_SPECIALISTS,
];

export const SPECIALIST_RUNNERS: Partial<Record<AgentId, SpecialistRunner>> = {
  "nia-context": niaContext,
  "hyperspell-brain": hyperspellBrain,
  "tensorlake-exec": tensorlakeExec,
  "codex-writer": codexWriter,
  "devin-engineer": devinEngineer,
  "reacher-social": reacherSocial,
  "vercel-v0": vercelV0,
  "insforge-backend": insforgeBackend,
  "aside-browser": asideBrowser,
  "convex-realtime": convexRealtime,
};

/**
 * Discovered specialists registered at runtime. Persisted in Convex so they
 * survive across requests; this Map is a per-process cache hydrated on demand.
 */
const DISCOVERED: Map<string, SpecialistConfig> = new Map();

export function registerDiscoveredSpecialist(config: SpecialistConfig) {
  DISCOVERED.set(config.agent_id, { ...config, discovered: true });
}

export function getDiscoveredSpecialists(): SpecialistConfig[] {
  return Array.from(DISCOVERED.values());
}

export function getAllSpecialists(): SpecialistConfig[] {
  return [...SPECIALISTS, ...getDiscoveredSpecialists()];
}

function buildRunner(cfg: SpecialistConfig): SpecialistRunner {
  if (cfg.mcp_endpoint) return makeMcpForwardingSpecialist(cfg);
  // Demo mock LLM policy: when env-flagged, inactive A2A contacts surface as a
  // sandbox adapter that produces useful but disclosed work in the agent persona.
  if (isSandboxA2AEnabled()) {
    const effective = effectiveExecutionStatus(cfg);
    if (effective === "arbor_sandbox_adapter") {
      return makeSandboxA2ASpecialist(cfg);
    }
  }
  if (cfg.protocol === "a2a" || cfg.a2a_agent_card_url || cfg.a2a_endpoint) {
    return makeA2AForwardingSpecialist(cfg);
  }
  return makeUnavailableSpecialist(cfg);
}

function makeUnavailableSpecialist(config: SpecialistConfig): SpecialistRunner {
  return {
    config,
    async bid(): Promise<DeclineDecision> {
      return {
        decline: true,
        reason:
          "Strict no-mock policy: no real MCP or A2A execution connection is configured for this specialist, so Arbor will not use a placeholder persona.",
      };
    },
    async execute(): Promise<never> {
      throw new Error(
        `${config.agent_id} has no real MCP or A2A execution connection configured under Arbor's strict no-mock policy`,
      );
    },
  };
}

export function getRunner(agent_id: AgentId): SpecialistRunner {
  const runner = SPECIALIST_RUNNERS[agent_id];
  if (runner) return runner;
  const cfg =
    SPECIALISTS.find((s) => s.agent_id === agent_id) ?? DISCOVERED.get(agent_id);
  if (!cfg) throw new Error(`No specialist runner registered for ${agent_id}`);
  return buildRunner(cfg);
}
