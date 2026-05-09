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
import type { SpecialistConfig, SpecialistRunner, AgentId } from "../types";

export const SPECIALISTS: SpecialistConfig[] = [
  NIA_CONTEXT_CONFIG,
  HYPERSPELL_BRAIN_CONFIG,
  TENSORLAKE_EXEC_CONFIG,
  CODEX_WRITER_CONFIG,
  DEVIN_ENGINEER_CONFIG,
];

export const SPECIALIST_RUNNERS: Record<AgentId, SpecialistRunner> = {
  "nia-context": niaContext,
  "hyperspell-brain": hyperspellBrain,
  "tensorlake-exec": tensorlakeExec,
  "codex-writer": codexWriter,
  "devin-engineer": devinEngineer,
};

export function getRunner(agent_id: AgentId): SpecialistRunner {
  return SPECIALIST_RUNNERS[agent_id];
}
