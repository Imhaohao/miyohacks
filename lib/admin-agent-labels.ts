/**
 * Two-axis labeling for the admin agents page: separate "how does this agent
 * run?" (execution) from "can we actually pay it?" (payments). The previous
 * old universal payout-readiness pill conflated the two — an agent with no
 * Stripe Connect account is in a very different state than one whose
 * transfer failed.
 */

import type {
  AdminAgentExecutionLabel,
  AdminAgentPaymentLabel,
  AdminAgentsResponse,
} from "./admin-types";
import { EXECUTION_STATUS_LABELS } from "./agent-execution-status";
import type { AgentExecutionStatus } from "./types";

export interface ExecutionLabelInfo {
  label: AdminAgentExecutionLabel;
  tone: "success" | "neutral" | "warning" | "danger";
  description: string;
}

export interface PaymentLabelInfo {
  label: AdminAgentPaymentLabel;
  tone: "success" | "warning" | "danger" | "neutral";
  description: string;
  connectButton: "start" | "refresh" | "none";
}

const EXECUTION_LABEL_MAP: Record<AgentExecutionStatus, AdminAgentExecutionLabel> = {
  native_mcp: "Verified",
  native_a2a: "Verified",
  arbor_real_adapter: "Verified",
  arbor_sandbox_adapter: "Configured",
  needs_vendor_a2a_endpoint: "Degraded",
  mock_unconnected: "Unavailable",
};

const EXECUTION_TONE: Record<AdminAgentExecutionLabel, ExecutionLabelInfo["tone"]> = {
  Verified: "success",
  Configured: "neutral",
  Degraded: "warning",
  Unavailable: "danger",
};

export function executionLabelFor(
  agent: AdminAgentsResponse["agents"][number],
): ExecutionLabelInfo {
  const status = (agent.execution_status as AgentExecutionStatus | undefined) ??
    (agent.protocol === "mcp" ? "native_mcp" : "mock_unconnected");
  const label = EXECUTION_LABEL_MAP[status];
  return {
    label,
    tone: EXECUTION_TONE[label],
    description: `${label}: ${EXECUTION_STATUS_LABELS[status]}`,
  };
}

export function paymentLabelFor(
  agent: AdminAgentsResponse["agents"][number],
): PaymentLabelInfo {
  // The execution surface decides whether the agent is allowed to earn at
  // all. A blocked/sandbox agent doesn't need a Connect account.
  const execStatus = (agent.execution_status as AgentExecutionStatus | undefined) ??
    (agent.protocol === "mcp" ? "native_mcp" : "mock_unconnected");
  const earnable =
    execStatus === "native_mcp" ||
    execStatus === "native_a2a" ||
    execStatus === "arbor_real_adapter";
  if (!earnable) {
    return {
      label: "Not payable",
      tone: "neutral",
      description:
        "This agent is either unavailable or running only under a disclosed demo mock policy, so no payout is required.",
      connectButton: "none",
    };
  }
  if (agent.payouts_enabled) {
    return {
      label: "Connect ready",
      tone: "success",
      description:
        "Connect account onboarded and payouts enabled. Live transfers will succeed.",
      connectButton: "refresh",
    };
  }
  if (!agent.has_connect_account) {
    return {
      label: "Connect needed",
      tone: "warning",
      description:
        "No Stripe Connect account on file. Live earnings will sit as payable until onboarding starts.",
      connectButton: "start",
    };
  }
  if (agent.requirements_due && agent.requirements_due.length > 0) {
    return {
      label: "Transfer failed",
      tone: "danger",
      description: `Connect account exists but is restricted. Outstanding: ${agent.requirements_due.join(", ")}.`,
      connectButton: "refresh",
    };
  }
  return {
    label: "Transfer failed",
    tone: "danger",
    description:
      "Connect account exists but payouts are disabled. Refresh the onboarding link to resolve.",
    connectButton: "refresh",
  };
}
