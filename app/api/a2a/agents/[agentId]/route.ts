import { NextRequest } from "next/server";
import { corsPreflight, jsonError, jsonOk } from "@/lib/http";
import {
  contactToSpecialistConfig,
  getAgentContact,
} from "@/lib/agent-contacts";
import {
  EXECUTION_STATUS_DESCRIPTIONS,
  EXECUTION_STATUS_LABELS,
  classifyAgentExecution,
} from "@/lib/agent-execution-status";
import { makeMcpForwardingSpecialist } from "@/lib/specialists/mcp-forwarding";
import { SPECIALIST_RUNNERS } from "@/lib/specialists/registry";
import type {
  AgentExecutionStatus,
  AgentId,
  SpecialistConfig,
  SpecialistOutput,
  SpecialistRunner,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface A2ARequest {
  id?: string | number;
  method?: string;
  params?: {
    message?: {
      parts?: Array<{
        kind?: string;
        type?: string;
        text?: string;
      }>;
    };
    metadata?: Record<string, unknown>;
  };
}

type A2ASupportedMethod = "message/send" | "tasks/send";

interface RouteContext {
  params: Promise<{ agentId: string }>;
}

function agentUrl(req: NextRequest, agentId: string) {
  const url = new URL(req.url);
  url.pathname = `/api/a2a/agents/${agentId}`;
  url.search = "";
  return url.toString();
}

function promptFromMessage(body: A2ARequest) {
  return (
    body.params?.message?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => Boolean(text?.trim()))
      .join("\n\n")
      .trim() ?? ""
  );
}

function taskType(body: A2ARequest) {
  const raw = body.params?.metadata?.task_type;
  return typeof raw === "string" && raw.trim() ? raw : "general";
}

function supportedMethod(method: string | undefined): method is A2ASupportedMethod {
  return method === "message/send" || method === "tasks/send";
}

function makeUnavailableRunner(
  config: SpecialistConfig,
  executionStatus: AgentExecutionStatus,
): SpecialistRunner {
  return {
    config,
    async bid() {
      return {
        decline: true,
        reason: EXECUTION_STATUS_DESCRIPTIONS[executionStatus],
      };
    },
    async execute(): Promise<SpecialistOutput> {
      throw new Error(EXECUTION_STATUS_DESCRIPTIONS[executionStatus]);
    },
  };
}

function bridgeRunner(config: SpecialistConfig): {
  runner: SpecialistRunner;
  executionStatus: AgentExecutionStatus;
  nativeConnection: boolean;
} {
  const staticRunner = SPECIALIST_RUNNERS[config.agent_id as AgentId];
  if (staticRunner) {
    const realConfig = staticRunner.config;
    const executionStatus = classifyAgentExecution(realConfig);
    return {
      runner: staticRunner,
      executionStatus,
      nativeConnection:
        executionStatus === "native_mcp" || executionStatus === "native_a2a",
    };
  }

  const executionStatus = classifyAgentExecution(config);
  if (config.mcp_endpoint) {
    return {
      runner: makeMcpForwardingSpecialist(config),
      executionStatus,
      nativeConnection: true,
    };
  }

  return {
    runner: makeUnavailableRunner(config, executionStatus),
    executionStatus,
    nativeConnection: false,
  };
}

function backingSystem(
  config: SpecialistConfig,
  executionStatus: AgentExecutionStatus,
) {
  if (config.agent_id === "codex-writer") return "codex_runner";
  if (config.agent_id === "hyperspell-brain") return "hyperspell_memory_api";
  if (config.agent_id === "vercel-v0") return "v0_api";
  if (executionStatus === "native_mcp") return "mcp";
  if (executionStatus === "native_a2a") return "a2a";
  return "not_connected";
}

function a2aTaskResult(args: {
  id: string | number | null;
  agentId: string;
  state: "completed" | "failed";
  text: string;
  description: string;
  artifactData?: unknown;
}) {
  return {
    jsonrpc: "2.0",
    id: args.id,
    result: {
      id: `arbor-a2a-${args.agentId}-${Date.now()}`,
      status: {
        state: args.state,
        message: {
          role: "agent",
          parts: [{ kind: "text", text: args.text }],
        },
      },
      artifacts:
        args.state === "failed"
          ? []
          : [
              {
                name: `${args.agentId}-artifact`,
                description: args.description,
                parts: [
                  { kind: "text", text: args.text },
                  ...(args.artifactData === undefined
                    ? []
                    : [{ kind: "data", data: args.artifactData }]),
                ],
              },
            ],
    },
  };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { agentId } = await params;
  const contact = getAgentContact(agentId);
  if (!contact) return jsonError("agent not found", 404);
  const config = contactToSpecialistConfig(contact);
  const { executionStatus, nativeConnection } = bridgeRunner(config);

  return jsonOk({
    protocolVersion: "0.2.6",
    name: contact.display_name,
    description: contact.one_liner,
    url: agentUrl(req, agentId),
    version: "1.0.0",
    provider: {
      organization: "Arbor",
      url: new URL(req.url).origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
      executionMode: executionStatus,
      executionStatus,
      executionLabel: EXECUTION_STATUS_LABELS[executionStatus],
      executionDescription: EXECUTION_STATUS_DESCRIPTIONS[executionStatus],
      backingSystem: backingSystem(config, executionStatus),
      nativeConnection,
    },
    defaultInputModes: contact.supported_input_modes,
    defaultOutputModes: contact.supported_output_modes,
    skills: contact.capabilities.map((capability) => ({
      id: capability,
      name: capability,
      description: `${contact.display_name} can help with ${capability}.`,
      tags: contact.domain_tags.slice(0, 8),
    })),
  });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { agentId } = await params;
  const contact = getAgentContact(agentId);
  if (!contact) return jsonError("agent not found", 404);

  let body: A2ARequest;
  try {
    body = (await req.json()) as A2ARequest;
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  if (!supportedMethod(body.method)) {
    return jsonError(`unsupported A2A method: ${body.method ?? "missing"}`, 400);
  }

  const prompt = promptFromMessage(body);
  if (!prompt) return jsonError("message.parts text is required", 400);

  const config = contactToSpecialistConfig(contact);
  const { runner, executionStatus, nativeConnection } = bridgeRunner(config);
  let text: string;
  let artifact: unknown;
  if (
    executionStatus === "mock_unconnected" ||
    executionStatus === "needs_vendor_a2a_endpoint"
  ) {
    const errorText = [
      `# ${contact.display_name} unavailable`,
      "",
      EXECUTION_STATUS_DESCRIPTIONS[executionStatus],
      "",
      `Execution status: ${executionStatus}`,
      `Native connection: ${nativeConnection ? "yes" : "no"}`,
      "",
      "Arbor will not substitute a ChatGPT placeholder for this A2A request.",
    ].join("\n");
    return jsonOk(
      a2aTaskResult({
        id: body.id ?? null,
        agentId,
        state: "failed",
        text: errorText,
        description: contact.one_liner,
      }),
    );
  }

  try {
    const output = await runner.execute(prompt, taskType(body));
    if (typeof output === "string") {
      text = output;
    } else {
      text = output.summary;
      artifact = output;
    }
  } catch {
    const errorText = [
      `# ${contact.display_name} execution failed`,
      "",
      "The Arbor-hosted A2A bridge accepted the task, but the configured execution runner could not complete it.",
      "",
      `Execution status: ${executionStatus}`,
      `Native connection: ${nativeConnection ? "yes" : "no"}`,
      "",
      "This failure is returned as an A2A failed task state instead of silently substituting placeholder work.",
    ].join("\n");
    return jsonOk(
      a2aTaskResult({
        id: body.id ?? null,
        agentId,
        state: "failed",
        text: errorText,
        description: contact.one_liner,
      }),
    );
  }

  return jsonOk(
    a2aTaskResult({
      id: body.id ?? null,
      agentId,
      state: "completed",
      text,
      description: contact.one_liner,
      artifactData: {
        execution: {
          mode: executionStatus,
          execution_status: executionStatus,
          native_connection: nativeConnection,
          task_type: taskType(body),
          request_method: body.method,
        },
        artifact,
      },
    }),
  );
}

export function OPTIONS() {
  return corsPreflight();
}
