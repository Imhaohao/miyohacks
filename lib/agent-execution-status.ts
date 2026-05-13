import type { AgentExecutionStatus, AgentId, AgentProtocol } from "./types";

type ExecutionSubject = {
  agent_id: AgentId | string;
  protocol?: AgentProtocol;
  endpoint_url?: string;
  agent_card_url?: string;
  mcp_endpoint?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
};

export const ARBOR_REAL_ADAPTER_AGENT_IDS = [
  "hyperspell-brain",
  "codex-writer",
  "vercel-v0",
] as const;

export const ARBOR_MCP_BACKED_A2A_AGENT_IDS = [
  "nia-context",
  "reacher-social",
] as const;

export const VENDOR_A2A_ENDPOINT_REQUIRED_AGENT_IDS = [
  "tensorlake-exec",
  "devin-engineer",
  "insforge-backend",
  "aside-browser",
  "convex-realtime",
] as const;

const REAL_ADAPTERS = new Set<string>(ARBOR_REAL_ADAPTER_AGENT_IDS);
const MCP_BACKED_A2A = new Set<string>(ARBOR_MCP_BACKED_A2A_AGENT_IDS);
const NEEDS_VENDOR_A2A = new Set<string>(
  VENDOR_A2A_ENDPOINT_REQUIRED_AGENT_IDS,
);

export const EXECUTION_STATUS_LABELS: Record<AgentExecutionStatus, string> = {
  native_mcp: "Native MCP",
  native_a2a: "Native A2A",
  arbor_real_adapter: "Arbor adapter",
  needs_vendor_a2a_endpoint: "Needs vendor A2A",
  mock_unconnected: "Mock only",
};

export const EXECUTION_STATUS_DESCRIPTIONS: Record<
  AgentExecutionStatus,
  string
> = {
  native_mcp: "Backed by a real MCP endpoint.",
  native_a2a: "Backed by a real vendor A2A endpoint.",
  arbor_real_adapter:
    "Arbor exposes A2A, but execution calls a real underlying API or runner.",
  needs_vendor_a2a_endpoint:
    "A sponsor runner exists, but no real vendor A2A endpoint is configured.",
  mock_unconnected:
    "Visible in the catalog only; it must not execute through a ChatGPT placeholder.",
};

export function isArborA2ABridgeUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith("/api/a2a/agents/");
  } catch {
    return url.includes("/api/a2a/agents/");
  }
}

function realA2AEndpoint(subject: ExecutionSubject): string | undefined {
  const endpoint =
    subject.a2a_endpoint ??
    (subject.protocol === "a2a" ? subject.endpoint_url : undefined);
  return endpoint && !isArborA2ABridgeUrl(endpoint) ? endpoint : undefined;
}

function realMcpEndpoint(subject: ExecutionSubject): string | undefined {
  return (
    subject.mcp_endpoint ??
    (subject.protocol === "mcp" ? subject.endpoint_url : undefined)
  );
}

export function classifyAgentExecution(
  subject: ExecutionSubject,
): AgentExecutionStatus {
  if (realMcpEndpoint(subject)) return "native_mcp";
  if (realA2AEndpoint(subject)) return "native_a2a";
  if (MCP_BACKED_A2A.has(subject.agent_id)) return "native_mcp";
  if (REAL_ADAPTERS.has(subject.agent_id)) return "arbor_real_adapter";
  if (NEEDS_VENDOR_A2A.has(subject.agent_id)) {
    return "needs_vendor_a2a_endpoint";
  }
  return "mock_unconnected";
}

export function executionStatusCounts<T extends ExecutionSubject>(
  subjects: T[],
): Record<AgentExecutionStatus, number> {
  const counts: Record<AgentExecutionStatus, number> = {
    native_mcp: 0,
    native_a2a: 0,
    arbor_real_adapter: 0,
    needs_vendor_a2a_endpoint: 0,
    mock_unconnected: 0,
  };
  for (const subject of subjects) {
    counts[classifyAgentExecution(subject)] += 1;
  }
  return counts;
}
