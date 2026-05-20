import {
  classifyAgentExecution,
  isSandboxA2AEnabled,
  isSelectableExecutionStatus,
} from "./agent-execution-status";
import { isExecutableAgent } from "./agent-roles";
import type { AgentExecutionStatus, AgentRole } from "./types";

export interface SelectableBidLike {
  agent_id: string;
  agent_role?: AgentRole;
  bid_price: number;
  tool_availability?: {
    status?: "available" | "manual" | "mock" | "missing";
    execution_status?: AgentExecutionStatus;
    opens_prs?: boolean;
  };
}

const PR_CAPABLE_AGENT_IDS = new Set<string>(["codex-writer"]);

export function bidCanOpenPullRequest(bid: SelectableBidLike): boolean {
  if (bid.tool_availability?.opens_prs === true) return true;
  return PR_CAPABLE_AGENT_IDS.has(bid.agent_id);
}

export function bidExecutionStatus(
  bid: SelectableBidLike,
): AgentExecutionStatus {
  return (
    bid.tool_availability?.execution_status ??
    classifyAgentExecution({ agent_id: bid.agent_id })
  );
}

export function isSelectableExecutorBid(
  bid: SelectableBidLike,
  maxBudget: number,
): boolean {
  if (bid.bid_price > maxBudget) return false;
  if (!isExecutableAgent(bid.agent_id, bid.agent_role)) return false;
  if (bid.tool_availability?.status !== "available") return false;
  return isSelectableExecutionStatus(bidExecutionStatus(bid));
}

export function explainUnselectableExecutorBid(
  bid: SelectableBidLike,
  maxBudget: number,
): string | null {
  if (bid.bid_price > maxBudget) return "bid exceeds budget";
  if (!isExecutableAgent(bid.agent_id, bid.agent_role)) {
    return "agent is context/executive support, not an executor";
  }
  if (bid.tool_availability?.status !== "available") {
    return `tools are ${bid.tool_availability?.status ?? "unknown"}`;
  }
  const status = bidExecutionStatus(bid);
  if (!isSelectableExecutionStatus(status)) {
    if (status === "arbor_sandbox_adapter" && !isSandboxA2AEnabled()) {
      return "demo mock LLM policy is disabled (set ARBOR_MOCK_POLICY=demo_mock_llm to allow)";
    }
    return "agent has no verified external execution connection";
  }
  return null;
}
