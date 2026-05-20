import type { AgentExecutionStatus, AgentMockPolicy } from "./types";

export const MOCK_POLICY_LABELS: Record<AgentMockPolicy, string> = {
  strict_no_mock: "Strict no-mock",
  demo_mock_llm: "Demo mock LLM",
};

export const MOCK_POLICY_DESCRIPTIONS: Record<AgentMockPolicy, string> = {
  strict_no_mock:
    "Unconnected agents may appear in the registry, but they cannot bid, execute, or earn through a placeholder LLM.",
  demo_mock_llm:
    "Demo-only mode: eligible unconnected A2A agents may produce clearly disclosed Arbor LLM sandbox artifacts instead of vendor-native output.",
};

export const MOCK_POLICY_ENV_VAR = "ARBOR_MOCK_POLICY";
export const MOCK_POLICY_LEGACY_ENV_VAR = "ENABLE_SANDBOX_A2A";

function normalizeMockPolicy(raw: string | undefined): AgentMockPolicy | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (
    value === "demo_mock_llm" ||
    value === "mock_llm" ||
    value === "sandbox" ||
    value === "demo"
  ) {
    return "demo_mock_llm";
  }
  if (
    value === "strict_no_mock" ||
    value === "strict" ||
    value === "no_mock" ||
    value === "false"
  ) {
    return "strict_no_mock";
  }
  return null;
}

export function currentMockPolicy(): AgentMockPolicy {
  return (
    normalizeMockPolicy(process.env[MOCK_POLICY_ENV_VAR]) ??
    (process.env[MOCK_POLICY_LEGACY_ENV_VAR]?.toLowerCase() === "true"
      ? "demo_mock_llm"
      : "strict_no_mock")
  );
}

export function isDemoMockLLMPolicyEnabled(): boolean {
  return currentMockPolicy() === "demo_mock_llm";
}

export function mockPolicyForExecutionStatus(
  status: AgentExecutionStatus,
): AgentMockPolicy {
  return status === "arbor_sandbox_adapter"
    ? "demo_mock_llm"
    : "strict_no_mock";
}

export function mockPolicyMetadata(policy: AgentMockPolicy = currentMockPolicy()) {
  return {
    mock_policy: policy,
    mock_policy_label: MOCK_POLICY_LABELS[policy],
    mock_policy_description: MOCK_POLICY_DESCRIPTIONS[policy],
  };
}
