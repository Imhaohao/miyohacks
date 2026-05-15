import {
  classifyAgentExecution,
  isRealExecutionStatus,
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
  };
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
  return isRealExecutionStatus(bidExecutionStatus(bid));
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
  if (!isRealExecutionStatus(bidExecutionStatus(bid))) {
    return "agent has no verified external execution connection";
  }
  return null;
}
