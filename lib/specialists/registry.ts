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
import { TENSORLAKE_A2A_CONFIG } from "./tensorlake-a2a";
import { DEVIN_A2A_CONFIG } from "./devin-a2a";
import { CONVEX_A2A_CONFIG } from "./convex-a2a";
import { WORKER_A2A_CONFIG } from "./worker-a2a";
import { makeMcpForwardingSpecialist } from "./mcp-forwarding";
import { makeA2aForwardingSpecialist } from "./a2a-forwarding";
import { makeMockSpecialist } from "./base";
import { makeDevinMcpBridgeSpecialist } from "./devin-bridge";
import type { SpecialistConfig, SpecialistRunner, AgentId } from "../types";
export { toPublicTier } from "./tiers";

/**
 * Seed A2A specialist that round-trips to Arbor's own /api/a2a/market gateway.
 * Proves the outbound A2A runner works without depending on an external service.
 * The endpoint resolves to the local dev server (or the deployed Vercel URL).
 */
const ARBOR_LOOPBACK_BASE =
  process.env.ARBOR_LOOPBACK_BASE ?? "http://localhost:3000";

const ARBOR_LOOPBACK_A2A_CONFIG: SpecialistConfig = {
  agent_id: "arbor-loopback-a2a",
  display_name: "Arbor Market (A2A loopback)",
  sponsor: "Arbor",
  capabilities: ["task routing", "specialist dispatch", "market discovery"],
  system_prompt:
    "You are the Arbor market gateway, reachable via the A2A protocol. You route tasks to registered specialists.",
  // Honest price: the loopback resells the work of whichever specialist the
  // market routes to, so its true cost is a full specialist price — not a
  // token amount. At 0.05 it scored reputation/0.05 = 16, beat every real
  // bidder, then "delivered" a routing receipt that judges score 0.
  cost_baseline: 1.0,
  starting_reputation: 0.8,
  one_liner: "Routes tasks through the Arbor market via A2A.",
  tier: "a2a",
  a2a_endpoint: `${ARBOR_LOOPBACK_BASE}/api/a2a/market`,
  // The app origin serves no /.well-known/agent-card.json; the market route
  // returns its card on GET, so point card discovery directly at it.
  a2a_agent_card_url: `${ARBOR_LOOPBACK_BASE}/api/a2a/market`,
};

const INCLUDE_DEMO_MOCK_SPECIALISTS =
  process.env.ARBOR_INCLUDE_DEMO_MOCK_SPECIALISTS === "true";

const DEMO_MOCK_SPECIALISTS: SpecialistConfig[] = [
  CODEX_WRITER_CONFIG,
  ASIDE_BROWSER_CONFIG,
  CONVEX_REALTIME_CONFIG,
];

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
  DEVIN_ENGINEER_CONFIG,
  VERCEL_V0_CONFIG,
  INSFORGE_BACKEND_CONFIG,
  ...(INCLUDE_DEMO_MOCK_SPECIALISTS ? DEMO_MOCK_SPECIALISTS : []),
  ARBOR_LOOPBACK_A2A_CONFIG,
  // External A2A specialists — registered when their env vars are present.
  TENSORLAKE_A2A_CONFIG,
  DEVIN_A2A_CONFIG,
  CONVEX_A2A_CONFIG,
  WORKER_A2A_CONFIG,
].filter((s) => s.tier !== "disabled");

export const SPECIALIST_RUNNERS: Partial<Record<AgentId, SpecialistRunner>> = {
  "nia-context": niaContext,
  "hyperspell-brain": hyperspellBrain,
  "tensorlake-exec": tensorlakeExec,
  "devin-engineer": devinEngineer,
  "reacher-social": reacherSocial,
  "vercel-v0": vercelV0,
  "insforge-backend": insforgeBackend,
  ...(INCLUDE_DEMO_MOCK_SPECIALISTS
    ? {
        "codex-writer": codexWriter,
        "aside-browser": asideBrowser,
        "convex-realtime": convexRealtime,
      }
    : {}),
};

// Warn once at module load for every specialist that is explicitly mocked.
// Keeps "npm run dev" honest — mock specialists are clearly visible in console.
for (const cfg of SPECIALISTS) {
  if (cfg.tier === "mock") {
    console.warn(
      `[arbor] specialist "${cfg.agent_id}" (${cfg.sponsor}) is running as tier:"mock" — no live tools will be called.`,
    );
  }
}

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

/**
 * Tier-driven runner factory. Replaces the old implicit
 * `if (cfg.mcp_endpoint) … else mock` branch. Every tier must be declared
 * explicitly in the config — there is no silent downgrade.
 */
function buildRunner(cfg: SpecialistConfig): SpecialistRunner {
  switch (cfg.tier) {
    case "real": {
      // "real" specialists must have a hand-written runner in SPECIALIST_RUNNERS.
      // If missing, it's a configuration error — fail loudly.
      const runner = SPECIALIST_RUNNERS[cfg.agent_id];
      if (!runner) {
        throw new Error(
          `Specialist "${cfg.agent_id}" has tier:"real" but no hand-written runner is registered in SPECIALIST_RUNNERS. Add one or change the tier.`,
        );
      }
      return runner;
    }

    case "mcp-forwarding": {
      if (!cfg.mcp_endpoint) {
        throw new Error(
          `Specialist "${cfg.agent_id}" has tier:"mcp-forwarding" but mcp_endpoint is not set.`,
        );
      }
      // If an API key env var is declared but the env var is absent at
      // runtime, return a "decline loudly" runner — no silent mock fallback.
      if (cfg.mcp_api_key_env && !process.env[cfg.mcp_api_key_env]) {
        const missingKey = cfg.mcp_api_key_env;
        const agentId = cfg.agent_id;
        console.warn(
          `[arbor] specialist "${agentId}": env var ${missingKey} is not set — runner will decline all bids loudly.`,
        );
        return {
          config: cfg,
          async bid() {
            return {
              decline: true,
              reason: `${agentId} requires ${missingKey} to be set; the env var is missing so this specialist cannot execute tasks.`,
            };
          },
          async execute() {
            throw new Error(
              `${agentId} cannot execute: ${missingKey} is not configured.`,
            );
          },
        };
      }
      return makeMcpForwardingSpecialist(cfg);
    }

    case "a2a": {
      if (!cfg.a2a_endpoint) {
        throw new Error(
          `Specialist "${cfg.agent_id}" has tier:"a2a" but a2a_endpoint is not set.`,
        );
      }
      return makeA2aForwardingSpecialist(cfg);
    }

    case "a2a-bridge": {
      if (cfg.agent_id === "devin-engineer") {
        return makeDevinMcpBridgeSpecialist(cfg);
      }
      throw new Error(
        `Specialist "${cfg.agent_id}" has tier:"a2a-bridge" but no bridge runner is registered.`,
      );
    }

    case "mock": {
      // Explicit opt-in only.
      return makeMockSpecialist(cfg);
    }

    case "disabled": {
      // Should never reach here — disabled specialists are filtered out of SPECIALISTS.
      throw new Error(
        `Specialist "${cfg.agent_id}" is disabled and should never be dispatched.`,
      );
    }

    default: {
      const exhaustive: never = cfg.tier;
      throw new Error(`Unknown tier "${exhaustive}" on specialist "${cfg.agent_id}"`);
    }
  }
}

export function getRunner(agent_id: AgentId): SpecialistRunner {
  const runner = SPECIALIST_RUNNERS[agent_id];
  if (runner) return runner;
  const cfg =
    SPECIALISTS.find((s) => s.agent_id === agent_id) ?? DISCOVERED.get(agent_id);
  if (!cfg) throw new Error(`No specialist runner registered for ${agent_id}`);
  return buildRunner(cfg);
}
