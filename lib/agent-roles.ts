import type { AgentRole, SpecialistConfig } from "./types";

const ROLE_BY_AGENT_ID: Record<string, AgentRole> = {
  "hyperspell-brain": "executive",
  "nia-context": "context",
};

export function roleForAgent(
  agentId: string,
  explicitRole?: AgentRole,
): AgentRole {
  return ROLE_BY_AGENT_ID[agentId] ?? explicitRole ?? "executor";
}

export function roleForSpecialist(config: SpecialistConfig): AgentRole {
  return roleForAgent(config.agent_id, config.agent_role);
}

export function isExecutorRole(role: AgentRole | undefined): boolean {
  return role === "executor";
}

export function isExecutableAgent(
  agentId: string,
  explicitRole?: AgentRole,
): boolean {
  return isExecutorRole(roleForAgent(agentId, explicitRole));
}
