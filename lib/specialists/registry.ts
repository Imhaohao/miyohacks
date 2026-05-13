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
import type {
  SpecialistConfig,
  SpecialistRunner,
  AgentId,
  DeclineDecision,
} from "../types";

/**
 * All ten Nozomio sponsor agents. Listed in display order — Reacher first
 * because it is the primary data sponsor for this pivot and has a documented
 * MCP endpoint, which becomes live once REACHER_API_KEY is configured.
 */
export const SPECIALISTS: SpecialistConfig[] = [
  REACHER_SOCIAL_CONFIG,
  NIA_CONTEXT_CONFIG,
  HYPERSPELL_BRAIN_CONFIG,
  TENSORLAKE_EXEC_CONFIG,
  CODEX_WRITER_CONFIG,
  DEVIN_ENGINEER_CONFIG,
  VERCEL_V0_CONFIG,
  INSFORGE_BACKEND_CONFIG,
  ASIDE_BROWSER_CONFIG,
  CONVEX_REALTIME_CONFIG,
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
          "No real MCP or A2A execution connection is configured for this specialist, so Arbor will not use a placeholder persona.",
      };
    },
    async execute(): Promise<never> {
      throw new Error(
        `${config.agent_id} has no real MCP or A2A execution connection configured`,
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
