import {
  fetchAgentCard,
  normalizeA2AResult,
  sendA2ATask,
  type A2AAgentCard,
  type A2ATaskResponse,
} from "../a2a-client";
import {
  classifyAgentExecution,
  effectiveExecutionStatus,
  isArborA2ABridgeUrl,
  isSandboxA2AEnabled,
  SANDBOX_DISCLOSURE_TEXT,
} from "../agent-execution-status";
import {
  mockPolicyForExecutionStatus,
  mockPolicyMetadata,
} from "../mock-policy";
import { discoverTools, type RemoteMcpTool } from "../mcp-outbound";
import type { AgentConnectionState, BidPayload, SpecialistConfig } from "../types";

export type ConnectionProtocol = "mcp" | "a2a" | "arbor_a2a_bridge" | "none";
export type ConnectionProbeStatus =
  | "available"
  | "missing_auth"
  | "not_configured"
  | "unreachable"
  | "timeout"
  | "auth_failed"
  | "protocol_error";

export interface SpecialistConnection {
  protocol: ConnectionProtocol;
  endpointUrl?: string;
  agentCardUrl?: string;
  authEnv?: string;
  apiKey?: string;
  native: boolean;
}

export interface ConnectionProbe {
  protocol: ConnectionProtocol;
  status: ConnectionProbeStatus;
  native: boolean;
  checked: string[];
  missing: string[];
  reason: string;
  endpointUrl?: string;
  agentCardUrl?: string;
  toolCount?: number;
  toolNames?: string[];
  cardName?: string;
  checkedAt: string;
  latencyMs?: number;
}

export interface ConnectionTruth {
  configured: ToolAvailability;
  probe?: ConnectionProbe;
  connection_state: AgentConnectionState;
  effective_connected: boolean;
  last_probe_at?: string;
  last_probe_reason?: string;
}

export interface A2AExecutionResult {
  text: string;
  response: A2ATaskResponse;
  probe: ConnectionProbe;
}

type ToolAvailability = NonNullable<BidPayload["tool_availability"]>;

function trim(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

const PROBE_TTL_MS = Number(process.env.ARBOR_CONNECTIVITY_PROBE_TTL_MS ?? "60000");
function isProbeEnabled() {
  return (
    (process.env.ARBOR_CONNECTIVITY_PROBE_ENABLED ?? "true").toLowerCase() !==
    "false"
  );
}

const probeCache = new Map<
  string,
  { expiresAt: number; value: ConnectionProbe }
>();

function logProbe(config: SpecialistConfig, probe: ConnectionProbe) {
  const endpoint = probe.endpointUrl ?? probe.agentCardUrl ?? "";
  let endpointHash = "none";
  if (endpoint) {
    try {
      endpointHash = Buffer.from(endpoint).toString("base64").slice(0, 12);
    } catch {
      endpointHash = endpoint.slice(0, 12);
    }
  }
  console.info("[connection-probe]", {
    agent_id: config.agent_id,
    protocol: probe.protocol,
    status: probe.status,
    reason: probe.reason,
    checked_at: probe.checkedAt,
    latency_ms: probe.latencyMs,
    endpoint_hash: endpointHash,
  });
}

export function getSpecialistConnection(
  config: SpecialistConfig,
): SpecialistConnection {
  if (config.mcp_endpoint) {
    const authEnv = trim(config.mcp_api_key_env);
    return {
      protocol: "mcp",
      endpointUrl: config.mcp_endpoint,
      authEnv,
      apiKey: authEnv ? trim(process.env[authEnv]) : undefined,
      native: true,
    };
  }

  const endpointUrl = trim(config.a2a_endpoint);
  const agentCardUrl = trim(config.a2a_agent_card_url);
  if (endpointUrl || agentCardUrl) {
    const authEnv = trim(config.mcp_api_key_env);
    const native =
      !isArborA2ABridgeUrl(endpointUrl) && !isArborA2ABridgeUrl(agentCardUrl);
    return {
      protocol: native ? "a2a" : "arbor_a2a_bridge",
      endpointUrl,
      agentCardUrl,
      authEnv,
      apiKey: authEnv ? trim(process.env[authEnv]) : undefined,
      native,
    };
  }

  return { protocol: "none", native: false };
}

function missingCredential(connection: SpecialistConnection): string[] {
  return connection.authEnv && !connection.apiKey ? [connection.authEnv] : [];
}

function endpointHost(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export function configuredConnectionAvailability(
  config: SpecialistConfig,
): ToolAvailability {
  const connection = getSpecialistConnection(config);
  const executionSubject = {
    agent_id: config.agent_id,
    protocol: config.protocol,
    endpoint_url: connection.endpointUrl,
    agent_card_url: connection.agentCardUrl,
    mcp_endpoint: config.mcp_endpoint,
    a2a_endpoint: config.a2a_endpoint,
    a2a_agent_card_url: config.a2a_agent_card_url,
  };
  const intrinsicStatus = classifyAgentExecution(executionSubject);
  const effectiveStatus = effectiveExecutionStatus(executionSubject);
  const executionStatus = effectiveStatus;
  const checked = [
    connection.protocol,
    ...(connection.authEnv ? [connection.authEnv] : []),
  ].filter((item): item is string => Boolean(item));
  const missing = missingCredential(connection);
  const base = {
    checked,
    ...(missing.length > 0 ? { missing } : {}),
    protocol: connection.protocol,
    execution_status: executionStatus,
    endpoint_host: endpointHost(connection.endpointUrl ?? connection.agentCardUrl),
    ...mockPolicyMetadata(mockPolicyForExecutionStatus(executionStatus)),
  } satisfies Partial<ToolAvailability>;

  // Demo mock LLM policy: when enabled, otherwise inactive A2A contacts surface
  // as available via the sandbox adapter. The disclosure flag tells callers to
  // label output as sandbox rather than vendor-native.
  if (
    effectiveStatus === "arbor_sandbox_adapter" &&
    isSandboxA2AEnabled() &&
    (intrinsicStatus === "mock_unconnected" ||
      intrinsicStatus === "needs_vendor_a2a_endpoint")
  ) {
    return {
      ...base,
      status: "available",
      checked: [...checked, "ARBOR_MOCK_POLICY=demo_mock_llm"],
      reason: SANDBOX_DISCLOSURE_TEXT,
      sandbox: true,
      proof: `sandbox runner: ${config.agent_id}`,
      connection_state: "configured",
      effective_connected: true,
    };
  }

  if (intrinsicStatus === "mock_unconnected") {
    return {
      ...base,
      execution_status: intrinsicStatus,
      status: "missing",
      checked: [...checked, "execution_status"],
      reason:
        "strict no-mock policy: mock catalog entry has no real execution endpoint; Arbor will not use a ChatGPT placeholder",
      connection_state: "unavailable",
      effective_connected: false,
    };
  }

  if (intrinsicStatus === "needs_vendor_a2a_endpoint") {
    return {
      ...base,
      execution_status: intrinsicStatus,
      status: "missing",
      checked: [...checked, "execution_status"],
      reason:
        "strict no-mock policy: real vendor A2A endpoint is required before this agent can bid",
      connection_state: "unavailable",
      effective_connected: false,
    };
  }

  if (missing.length > 0) {
    return {
      ...base,
      status: "missing",
      checked,
      reason: `missing required credential${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      connection_state: "unavailable",
      effective_connected: false,
    };
  }

  if (connection.protocol === "mcp") {
    return {
      ...base,
      status: "available",
      checked,
      reason: "native MCP endpoint is configured",
      connection_state: "configured",
      effective_connected: true,
    };
  }

  if (connection.protocol === "a2a") {
    return {
      ...base,
      status: "available",
      checked,
      reason: "native A2A endpoint is configured",
      connection_state: "configured",
      effective_connected: true,
    };
  }

  if (connection.protocol === "arbor_a2a_bridge") {
    return {
      ...base,
      status: "available",
      checked,
      reason: "Arbor-hosted A2A bridge is configured",
      connection_state: "configured",
      effective_connected: true,
    };
  }

  if (config.protocol === "manual") {
    return {
      ...base,
      status: "manual",
      checked,
      reason: "manual specialist; no live API credential required",
      connection_state: "configured",
      effective_connected: false,
    };
  }

  if (config.protocol === "a2a") {
    return {
      ...base,
      status: "missing",
      checked,
      reason: "A2A protocol selected but no native endpoint is configured",
      connection_state: "unavailable",
      effective_connected: false,
    };
  }

  if (config.verification_status === "mock" || config.protocol === "mock") {
    return {
      ...base,
      status: "mock",
      checked,
      reason:
        "strict no-mock policy: mock specialist is catalog-only unless demo_mock_llm is explicitly enabled",
      connection_state: "configured",
      effective_connected: false,
    };
  }

  return {
    ...base,
    status: "mock",
    checked,
    reason:
      "strict no-mock policy: no MCP or A2A execution connection is configured",
    connection_state: "unavailable",
    effective_connected: false,
  };
}

function probeFromUnavailable(
  connection: SpecialistConnection,
  status: ConnectionProbeStatus,
  reason: string,
  extras?: Partial<Pick<ConnectionProbe, "latencyMs">>,
): ConnectionProbe {
  const missing = missingCredential(connection);
  return {
    protocol: connection.protocol,
    status,
    native: connection.native,
    checked: [
      connection.protocol,
      ...(connection.authEnv ? [connection.authEnv] : []),
    ].filter((item): item is string => Boolean(item)),
    missing,
    reason,
    endpointUrl: connection.endpointUrl,
    agentCardUrl: connection.agentCardUrl,
    checkedAt: new Date().toISOString(),
    ...(extras?.latencyMs !== undefined ? { latencyMs: extras.latencyMs } : {}),
  };
}

function classifyProbeError(err: unknown): ConnectionProbeStatus {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (message.includes("timed out") || message.includes("timeout")) {
    return "timeout";
  }
  if (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("invalid api key") ||
    message.includes("401") ||
    message.includes("403")
  ) {
    return "auth_failed";
  }
  if (
    message.includes("json-rpc") ||
    message.includes("invalid json") ||
    message.includes("protocol")
  ) {
    return "protocol_error";
  }
  return "unreachable";
}

export async function probeSpecialistConnection(
  config: SpecialistConfig,
  options?: { force?: boolean },
): Promise<ConnectionProbe> {
  const cacheKey = config.agent_id;
  const now = Date.now();
  const cached = probeCache.get(cacheKey);
  if (
    !options?.force &&
    cached &&
    cached.expiresAt > now
  ) {
    return cached.value;
  }
  const connection = getSpecialistConnection(config);
  if (connection.protocol === "none") {
    const probe = probeFromUnavailable(
      connection,
      "not_configured",
      "no MCP or A2A endpoint is configured",
    );
    probeCache.set(cacheKey, { value: probe, expiresAt: now + PROBE_TTL_MS });
    logProbe(config, probe);
    return probe;
  }
  const missing = missingCredential(connection);
  if (missing.length > 0) {
    const probe = probeFromUnavailable(
      connection,
      "missing_auth",
      `missing required credential${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    );
    probeCache.set(cacheKey, { value: probe, expiresAt: now + PROBE_TTL_MS });
    return probe;
  }

  if (connection.protocol === "mcp") {
    const startedAt = Date.now();
    try {
      const tools = await discoverTools(connection.endpointUrl!, connection.apiKey);
      const probe = {
        ...probeFromUnavailable(
          connection,
          "available",
          `native MCP endpoint returned ${tools.length} tool${tools.length === 1 ? "" : "s"}`,
          { latencyMs: Date.now() - startedAt },
        ),
        toolCount: tools.length,
        toolNames: tools.slice(0, 12).map((tool: RemoteMcpTool) => tool.name),
      };
      probeCache.set(cacheKey, { value: probe, expiresAt: now + PROBE_TTL_MS });
      logProbe(config, probe);
      return probe;
    } catch (err) {
      const probe = probeFromUnavailable(
        connection,
        classifyProbeError(err),
        err instanceof Error ? err.message : String(err),
        { latencyMs: Date.now() - startedAt },
      );
      probeCache.set(cacheKey, { value: probe, expiresAt: now + PROBE_TTL_MS });
      logProbe(config, probe);
      return probe;
    }
  }

  const startedAt = Date.now();
  try {
    let card: A2AAgentCard | undefined;
    if (connection.agentCardUrl) {
      card = await fetchAgentCard(connection.agentCardUrl, connection.apiKey);
    }
    const probe = {
      ...probeFromUnavailable(
        connection,
        "available",
        connection.protocol === "arbor_a2a_bridge"
          ? "Arbor-hosted A2A bridge is reachable"
          : "native A2A agent card is reachable",
        { latencyMs: Date.now() - startedAt },
      ),
      cardName: card?.name,
    };
    probeCache.set(cacheKey, { value: probe, expiresAt: now + PROBE_TTL_MS });
    logProbe(config, probe);
    return probe;
  } catch (err) {
    const probe = probeFromUnavailable(
      connection,
      classifyProbeError(err),
      err instanceof Error ? err.message : String(err),
      { latencyMs: Date.now() - startedAt },
    );
    probeCache.set(cacheKey, { value: probe, expiresAt: now + PROBE_TTL_MS });
    logProbe(config, probe);
    return probe;
  }
}

function connectionStateFromTruth(args: {
  configuredStatus: ToolAvailability["status"];
  probe?: ConnectionProbe;
}): AgentConnectionState {
  const { configuredStatus, probe } = args;
  if (configuredStatus === "available" && probe?.status === "available") {
    return "verified";
  }
  if (configuredStatus === "available" && probe && probe.status !== "available") {
    return "degraded";
  }
  if (configuredStatus === "available") return "configured";
  if (configuredStatus === "manual" || configuredStatus === "mock") {
    return "configured";
  }
  return "unavailable";
}

export async function assessSpecialistConnectionTruth(
  config: SpecialistConfig,
  options?: { forceProbe?: boolean },
): Promise<ConnectionTruth> {
  const configured = configuredConnectionAvailability(config);
  const shouldProbe =
    isProbeEnabled() &&
    (configured.protocol === "mcp" ||
      configured.protocol === "a2a" ||
      configured.protocol === "arbor_a2a_bridge") &&
    configured.status === "available";

  const probe = shouldProbe
    ? await probeSpecialistConnection(config, { force: options?.forceProbe })
    : undefined;
  const connection_state = connectionStateFromTruth({
    configuredStatus: configured.status,
    probe,
  });
  const effective_connected =
    (connection_state === "verified" ||
      (connection_state === "configured" && !shouldProbe)) &&
    configured.status === "available";

  return {
    configured,
    probe,
    connection_state,
    effective_connected,
    last_probe_at: probe?.checkedAt,
    last_probe_reason: probe?.reason,
  };
}

export function toolAvailabilityFromProbe(probe: ConnectionProbe): ToolAvailability {
  const base = {
    protocol: probe.protocol,
    execution_status:
      probe.protocol === "mcp"
        ? "native_mcp"
        : probe.protocol === "a2a"
          ? "native_a2a"
          : probe.protocol === "arbor_a2a_bridge"
            ? "arbor_real_adapter"
            : "mock_unconnected",
    endpoint_host: endpointHost(probe.endpointUrl ?? probe.agentCardUrl),
    proof:
      probe.toolNames && probe.toolNames.length > 0
        ? `tools/list: ${probe.toolNames.join(", ")}`
        : probe.cardName
          ? `agent-card: ${probe.cardName}`
          : undefined,
  } satisfies Partial<ToolAvailability>;
  if (probe.status === "missing_auth") {
    return {
      ...base,
      status: "missing",
      checked: probe.checked,
      missing: probe.missing,
      reason: probe.reason,
    };
  }
  if (probe.status === "available") {
    return {
      ...base,
      status: "available",
      checked: probe.checked,
      reason: probe.reason,
      connection_state: "verified",
      effective_connected: true,
      probe_status: probe.status,
      last_probe_at: probe.checkedAt,
      last_probe_reason: probe.reason,
      ...(probe.latencyMs !== undefined
        ? { last_probe_latency_ms: probe.latencyMs }
        : {}),
    };
  }
  return {
    ...base,
    status: "missing",
    checked: probe.checked,
    missing: probe.missing,
    reason: probe.reason,
    connection_state: "degraded",
    effective_connected: false,
    probe_status: probe.status,
    last_probe_at: probe.checkedAt,
    last_probe_reason: probe.reason,
    ...(probe.latencyMs !== undefined
      ? { last_probe_latency_ms: probe.latencyMs }
      : {}),
  };
}

export async function executeA2AConnectedSpecialist(args: {
  config: SpecialistConfig;
  prompt: string;
  taskType: string;
}): Promise<A2AExecutionResult> {
  const connection = getSpecialistConnection(args.config);
  if (
    connection.protocol !== "a2a" &&
    connection.protocol !== "arbor_a2a_bridge"
  ) {
    throw new Error(`${args.config.agent_id} does not have an A2A endpoint`);
  }
  if (!connection.endpointUrl) {
    throw new Error(`${args.config.agent_id} is missing an A2A message/send endpoint`);
  }

  const probe = await probeSpecialistConnection(args.config);
  if (probe.status !== "available") {
    throw new Error(`A2A connection unavailable: ${probe.reason}`);
  }

  const response = await sendA2ATask({
    endpointUrl: connection.endpointUrl,
    prompt: args.prompt,
    apiKey: connection.apiKey,
    metadata: {
      task_type: args.taskType,
      agent_id: args.config.agent_id,
      sponsor: args.config.sponsor,
      connection_protocol: connection.protocol,
    },
  });

  if (response.status?.state === "failed") {
    const message =
      response.status.message?.parts
        ?.map((part) => part.text)
        .filter((text): text is string => Boolean(text))
        .join("\n") || "A2A task failed";
    throw new Error(message);
  }

  return {
    text: normalizeA2AResult(response),
    response,
    probe,
  };
}
