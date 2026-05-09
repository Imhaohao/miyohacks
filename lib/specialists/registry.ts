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
import type { SpecialistConfig, SpecialistRunner, AgentId } from "../types";

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

export function getRunner(agent_id: AgentId): SpecialistRunner {
  const runner = SPECIALIST_RUNNERS[agent_id];
  if (runner) return runner;
  // Fallback: if the agent_id is in SPECIALISTS but no runner is registered
  // (shouldn't happen for sponsors), build one from the config — MCP-forwarding
  // when an endpoint is set, mock otherwise.
  const cfg = SPECIALISTS.find((s) => s.agent_id === agent_id);
  if (!cfg) throw new Error(`No specialist runner registered for ${agent_id}`);
  if (cfg.mcp_endpoint) return makeMcpForwardingSpecialist(cfg);
  throw new Error(`No runner and no mcp_endpoint for ${agent_id}`);
}
