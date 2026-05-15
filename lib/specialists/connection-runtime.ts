import {
  fetchAgentCard,
  normalizeA2AResult,
  sendA2ATask,
  type A2AAgentCard,
  type A2ATaskResponse,
} from "../a2a-client";
import {
  classifyAgentExecution,
  isArborA2ABridgeUrl,
} from "../agent-execution-status";
import { discoverTools, type RemoteMcpTool } from "../mcp-outbound";
import type { BidPayload, SpecialistConfig } from "../types";

export type ConnectionProtocol = "mcp" | "a2a" | "arbor_a2a_bridge" | "none";
export type ConnectionProbeStatus =
  | "available"
  | "missing_auth"
  | "not_configured"
  | "unreachable";

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
  const executionStatus = classifyAgentExecution({
    agent_id: config.agent_id,
    protocol: config.protocol,
    endpoint_url: connection.endpointUrl,
    agent_card_url: connection.agentCardUrl,
    mcp_endpoint: config.mcp_endpoint,
    a2a_endpoint: config.a2a_endpoint,
    a2a_agent_card_url: config.a2a_agent_card_url,
  });
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
  } satisfies Partial<ToolAvailability>;

  if (executionStatus === "mock_unconnected") {
    return {
      ...base,
      status: "missing",
      checked: [...checked, "execution_status"],
      reason:
        "mock catalog entry has no real execution endpoint; Arbor will not use a ChatGPT placeholder",
    };
  }

  if (executionStatus === "needs_vendor_a2a_endpoint") {
    return {
      ...base,
      status: "missing",
      checked: [...checked, "execution_status"],
      reason: "real vendor A2A endpoint is required before this agent can bid",
    };
  }

  if (missing.length > 0) {
    return {
      ...base,
      status: "missing",
      checked,
      reason: `missing required credential${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    };
  }

  if (connection.protocol === "mcp") {
    return {
      ...base,
      status: "available",
      checked,
      reason: "native MCP endpoint is configured",
    };
  }

  if (connection.protocol === "a2a") {
    return {
      ...base,
      status: "available",
      checked,
      reason: "native A2A endpoint is configured",
    };
  }

  if (connection.protocol === "arbor_a2a_bridge") {
    return {
      ...base,
      status: "available",
      checked,
      reason: "Arbor-hosted A2A bridge is configured",
    };
  }

  if (config.protocol === "manual") {
    return {
      ...base,
      status: "manual",
      checked,
      reason: "manual specialist; no live API credential required",
    };
  }

  if (config.protocol === "a2a") {
    return {
      ...base,
      status: "missing",
      checked,
      reason: "A2A protocol selected but no native endpoint is configured",
    };
  }

  if (config.verification_status === "mock" || config.protocol === "mock") {
    return {
      ...base,
      status: "mock",
      checked,
      reason: "mock specialist; output is synthetic",
    };
  }

  return {
    ...base,
    status: "mock",
    checked,
    reason: "no MCP or A2A execution connection is configured",
  };
}

function probeFromUnavailable(
  connection: SpecialistConnection,
  status: ConnectionProbeStatus,
  reason: string,
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
  };
}

export async function probeSpecialistConnection(
  config: SpecialistConfig,
): Promise<ConnectionProbe> {
  const connection = getSpecialistConnection(config);
  if (connection.protocol === "none") {
    return probeFromUnavailable(
      connection,
      "not_configured",
      "no MCP or A2A endpoint is configured",
    );
  }
  const missing = missingCredential(connection);
  if (missing.length > 0) {
    return probeFromUnavailable(
      connection,
      "missing_auth",
      `missing required credential${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    );
  }

  if (connection.protocol === "mcp") {
    try {
      const tools = await discoverTools(connection.endpointUrl!, connection.apiKey);
      return {
        ...probeFromUnavailable(
          connection,
          "available",
          `native MCP endpoint returned ${tools.length} tool${tools.length === 1 ? "" : "s"}`,
        ),
        toolCount: tools.length,
        toolNames: tools.slice(0, 12).map((tool: RemoteMcpTool) => tool.name),
      };
    } catch (err) {
      return probeFromUnavailable(
        connection,
        "unreachable",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  try {
    let card: A2AAgentCard | undefined;
    if (connection.agentCardUrl) {
      card = await fetchAgentCard(connection.agentCardUrl, connection.apiKey);
    }
    return {
      ...probeFromUnavailable(
        connection,
        "available",
        connection.protocol === "arbor_a2a_bridge"
          ? "Arbor-hosted A2A bridge is reachable"
          : "native A2A agent card is reachable",
      ),
      cardName: card?.name,
    };
  } catch (err) {
    return probeFromUnavailable(
      connection,
      "unreachable",
      err instanceof Error ? err.message : String(err),
    );
  }
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
    };
  }
  return {
    ...base,
    status: "missing",
    checked: probe.checked,
    missing: probe.missing,
    reason: probe.reason,
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
