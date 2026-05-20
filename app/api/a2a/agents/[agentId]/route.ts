import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { corsPreflight, jsonError, jsonOk } from "@/lib/http";
import {
  contactToSpecialistConfig,
  getAgentContact,
} from "@/lib/agent-contacts";
import {
  EXECUTION_STATUS_DESCRIPTIONS,
  EXECUTION_STATUS_LABELS,
  SANDBOX_DISCLOSURE_TEXT,
  classifyAgentExecution,
  effectiveExecutionStatus,
  isSandboxA2AEnabled,
} from "@/lib/agent-execution-status";
import {
  currentMockPolicy,
  mockPolicyForExecutionStatus,
  mockPolicyMetadata,
} from "@/lib/mock-policy";
import { makeMcpForwardingSpecialist } from "@/lib/specialists/mcp-forwarding";
import { makeA2AForwardingSpecialist } from "@/lib/specialists/a2a-forwarding";
import {
  makeSandboxA2ASpecialist,
  runSandboxA2AExecution,
  type SandboxArtifact,
} from "@/lib/specialists/sandbox-a2a-runner";
import { SPECIALIST_RUNNERS } from "@/lib/specialists/registry";
import { paymentServerSecret } from "@/lib/stripe";
import type {
  AgentExecutionStatus,
  AgentId,
  SpecialistConfig,
  SpecialistOutput,
  SpecialistRunner,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const A2A_PROTOCOL_VERSION = "0.3.0";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface MessagePart {
  kind?: string;
  type?: string;
  text?: string;
  data?: unknown;
}

interface MessageSendParams {
  message?: {
    parts?: MessagePart[];
  };
  metadata?: Record<string, unknown>;
}

interface TasksGetParams {
  id?: string;
}

interface TasksCancelParams {
  id?: string;
}

interface RouteContext {
  params: Promise<{ agentId: string }>;
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function agentUrl(req: NextRequest, agentId: string) {
  const url = new URL(req.url);
  url.pathname = `/api/a2a/agents/${agentId}`;
  url.search = "";
  return url.toString();
}

function promptFromMessage(params: MessageSendParams | undefined) {
  return (
    params?.message?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => Boolean(text?.trim()))
      .join("\n\n")
      .trim() ?? ""
  );
}

function metadataValue(params: MessageSendParams | undefined): Record<string, unknown> {
  return (params?.metadata ?? {}) as Record<string, unknown>;
}

function taskType(params: MessageSendParams | undefined) {
  const raw = metadataValue(params).task_type;
  return typeof raw === "string" && raw.trim() ? raw : "general";
}

function executionTaskType(agentId: string, params: MessageSendParams | undefined) {
  const requested = taskType(params);
  if (agentId === "codex-writer" && requested === "general") {
    return "implementation";
  }
  return requested;
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

interface ResolvedRunner {
  runner: SpecialistRunner;
  executionStatus: AgentExecutionStatus;
  intrinsicStatus: AgentExecutionStatus;
  nativeConnection: boolean;
  sandbox: boolean;
}

function bridgeRunner(config: SpecialistConfig): ResolvedRunner {
  const intrinsicStatus = classifyAgentExecution(config);
  const effective = effectiveExecutionStatus(config);
  const staticRunner = SPECIALIST_RUNNERS[config.agent_id as AgentId];
  if (staticRunner) {
    const realConfig = staticRunner.config;
    const realIntrinsic = classifyAgentExecution(realConfig);
    const realEffective = effectiveExecutionStatus(realConfig);
    return {
      runner: staticRunner,
      executionStatus: realEffective,
      intrinsicStatus: realIntrinsic,
      nativeConnection:
        realEffective === "native_mcp" || realEffective === "native_a2a",
      sandbox: realEffective === "arbor_sandbox_adapter",
    };
  }

  if (config.mcp_endpoint) {
    return {
      runner: makeMcpForwardingSpecialist(config),
      executionStatus: effective,
      intrinsicStatus,
      nativeConnection: true,
      sandbox: false,
    };
  }

  // Native A2A vendor: forward to the real endpoint. When the vendor fails
  // (unreachable, missing creds) and sandbox is enabled, message/send will
  // catch the error and fall back to the sandbox runner.
  if (effective === "native_a2a" && (config.a2a_endpoint || config.a2a_agent_card_url)) {
    return {
      runner: makeA2AForwardingSpecialist(config),
      executionStatus: effective,
      intrinsicStatus,
      nativeConnection: true,
      sandbox: false,
    };
  }

  if (effective === "arbor_sandbox_adapter") {
    return {
      runner: makeSandboxA2ASpecialist(config),
      executionStatus: effective,
      intrinsicStatus,
      nativeConnection: false,
      sandbox: true,
    };
  }

  return {
    runner: makeUnavailableRunner(config, effective),
    executionStatus: effective,
    intrinsicStatus,
    nativeConnection: false,
    sandbox: false,
  };
}

function backingSystem(
  config: SpecialistConfig,
  executionStatus: AgentExecutionStatus,
) {
  if (config.agent_id === "codex-writer") return "github_pr";
  if (config.agent_id === "hyperspell-brain") return "hyperspell_memory_api";
  if (config.agent_id === "vercel-v0") return "v0_api";
  if (executionStatus === "native_mcp") return "mcp";
  if (executionStatus === "native_a2a") return "a2a";
  if (executionStatus === "arbor_sandbox_adapter") return "arbor_sandbox";
  return "not_connected";
}

function jsonRpcError(args: {
  id: string | number | null;
  code: number;
  message: string;
  data?: unknown;
  status?: number;
}) {
  return jsonOk(
    {
      jsonrpc: "2.0",
      id: args.id,
      error: {
        code: args.code,
        message: args.message,
        ...(args.data ? { data: args.data } : {}),
      },
    },
    args.status ?? 200,
  );
}

function makeRunId(agentId: string) {
  return `arbor-a2a-${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function logPersistenceWarning(event: string, runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[a2a-task-runs] persistence warning", {
    event,
    run_id: runId,
    error: message,
  });
}

interface A2ATaskShape {
  id: string;
  kind: "task";
  status: {
    state: "submitted" | "working" | "completed" | "failed" | "canceled";
    message?: { role: string; parts: Array<{ kind: "text"; text: string }> };
  };
  artifacts: Array<{
    name?: string;
    description?: string;
    parts: Array<{ kind: "text" | "data"; text?: string; data?: unknown }>;
  }>;
  metadata?: Record<string, unknown>;
}

function buildSuccessTask(args: {
  runId: string;
  agentId: string;
  text: string;
  description: string;
  artifactData?: unknown;
  metadata?: Record<string, unknown>;
}): A2ATaskShape {
  return {
    id: args.runId,
    kind: "task",
    status: {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ kind: "text", text: args.text }],
      },
    },
    artifacts: [
      {
        name: `${args.agentId}-artifact`,
        description: args.description,
        parts: [
          { kind: "text", text: args.text },
          ...(args.artifactData === undefined
            ? []
            : [
                {
                  kind: "data" as const,
                  data: args.artifactData,
                },
              ]),
        ],
      },
    ],
    metadata: args.metadata,
  };
}

function buildFailureTask(args: {
  runId: string;
  text: string;
  metadata?: Record<string, unknown>;
}): A2ATaskShape {
  return {
    id: args.runId,
    kind: "task",
    status: {
      state: "failed",
      message: {
        role: "agent",
        parts: [{ kind: "text", text: args.text }],
      },
    },
    artifacts: [],
    metadata: args.metadata,
  };
}

function persistRunStart(args: {
  runId: string;
  agentId: string;
  executionStatus: AgentExecutionStatus;
  method: string;
  taskType: string;
  prompt: string;
  sandbox: boolean;
}) {
  // Best-effort persistence — failures (e.g. local dev without Convex)
  // should never break the JSON-RPC response.
  try {
    return convex()
      .mutation(api.a2aTaskRuns.start, {
        server_secret: paymentServerSecret(),
        run_id: args.runId,
        agent_id: args.agentId,
        execution_status: args.executionStatus,
        method: args.method,
        task_type: args.taskType,
        prompt: args.prompt,
        sandbox_disclosure: args.sandbox ? SANDBOX_DISCLOSURE_TEXT : undefined,
      })
      .catch((error) => {
        logPersistenceWarning("start", args.runId, error);
        return undefined;
      });
  } catch (error) {
    logPersistenceWarning("start", args.runId, error);
    return Promise.resolve(undefined);
  }
}

function persistRunWorking(runId: string) {
  try {
    return convex()
      .mutation(api.a2aTaskRuns.setWorking, {
        server_secret: paymentServerSecret(),
        run_id: runId,
      })
      .catch((error) => {
        logPersistenceWarning("set_working", runId, error);
        return undefined;
      });
  } catch (error) {
    logPersistenceWarning("set_working", runId, error);
    return Promise.resolve(undefined);
  }
}

function persistRunComplete(args: { runId: string; artifact: unknown }) {
  try {
    return convex()
      .mutation(api.a2aTaskRuns.complete, {
        server_secret: paymentServerSecret(),
        run_id: args.runId,
        artifact: args.artifact,
      })
      .catch((error) => {
        logPersistenceWarning("complete", args.runId, error);
        return undefined;
      });
  } catch (error) {
    logPersistenceWarning("complete", args.runId, error);
    return Promise.resolve(undefined);
  }
}

function persistRunFailure(args: { runId: string; message: string }) {
  try {
    return convex()
      .mutation(api.a2aTaskRuns.fail, {
        server_secret: paymentServerSecret(),
        run_id: args.runId,
        error_message: args.message,
      })
      .catch((error) => {
        logPersistenceWarning("fail", args.runId, error);
        return undefined;
      });
  } catch (error) {
    logPersistenceWarning("fail", args.runId, error);
    return Promise.resolve(undefined);
  }
}

function persistRunCancel(runId: string) {
  try {
    return convex()
      .mutation(api.a2aTaskRuns.cancel, {
        run_id: runId,
      })
      .catch((error) => {
        logPersistenceWarning("cancel", runId, error);
        return undefined;
      });
  } catch (error) {
    logPersistenceWarning("cancel", runId, error);
    return Promise.resolve(undefined);
  }
}

async function persistedRun(runId: string) {
  try {
    return await convex().query(api.a2aTaskRuns.getByRunId, {
      run_id: runId,
    });
  } catch (error) {
    logPersistenceWarning("get_by_run_id", runId, error);
    return null;
  }
}

function buildAgentCard(args: {
  req: NextRequest;
  agentId: string;
  config: SpecialistConfig;
  resolved: ResolvedRunner;
}) {
  const { req, agentId, config, resolved } = args;
  const contact = getAgentContact(agentId);
  const url = agentUrl(req, agentId);
  const intrinsic = resolved.intrinsicStatus;
  const effective = resolved.executionStatus;
  const policy = mockPolicyForExecutionStatus(effective);

  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: config.display_name,
    description: config.one_liner,
    url,
    version: "1.0.0",
    provider: {
      organization: "Arbor",
      url: new URL(req.url).origin,
    },
    // Per A2A v0.3.0, capabilities only describes protocol features.
    // Arbor-specific execution metadata lives under the `arbor` extension key.
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
      extensions: [
        {
          uri: "https://arbor.dev/a2a/extensions/execution",
          required: false,
          description:
            "Arbor execution metadata: execution_status, backing system, sandbox flag.",
        },
      ],
    },
    defaultInputModes: contact?.supported_input_modes ?? [
      "text/plain",
      "application/json",
    ],
    defaultOutputModes: contact?.supported_output_modes ?? [
      "text/markdown",
      "application/json",
    ],
    skills: (contact?.capabilities ?? config.capabilities).map((capability) => ({
      id: capability,
      name: capability,
      description: `${config.display_name} can help with ${capability}.`,
      tags: (contact?.domain_tags ?? []).slice(0, 8),
      inputModes: contact?.supported_input_modes ?? ["text/plain"],
      outputModes: contact?.supported_output_modes ?? ["text/markdown"],
    })),
    security:
      config.mcp_api_key_env || config.auth_type === "api_key"
        ? [{ bearer: [] }]
        : [],
    securitySchemes:
      config.mcp_api_key_env || config.auth_type === "api_key"
        ? {
            bearer: {
              type: "http",
              scheme: "bearer",
              description:
                "Optional bearer token for sponsor authentication; sandbox runs ignore it.",
            },
          }
        : {},
    supportsAuthenticatedExtendedCard: false,
    // Arbor-specific extension surface — explicitly namespaced so generic
    // A2A clients can ignore it.
    arbor: {
      execution_status: effective,
      intrinsic_execution_status: intrinsic,
      execution_label: EXECUTION_STATUS_LABELS[effective],
      execution_description: EXECUTION_STATUS_DESCRIPTIONS[effective],
      backing_system: backingSystem(config, effective),
      native_connection: resolved.nativeConnection,
      sandbox: resolved.sandbox,
      sandbox_enabled: isSandboxA2AEnabled(),
      active_mock_policy: currentMockPolicy(),
      ...mockPolicyMetadata(policy),
      sandbox_disclosure: resolved.sandbox ? SANDBOX_DISCLOSURE_TEXT : null,
      supported_methods: [
        "message/send",
        "tasks/send",
        "tasks/get",
        "tasks/cancel",
      ],
    },
  };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { agentId } = await params;
  const contact = getAgentContact(agentId);
  if (!contact) return jsonError("agent not found", 404);
  const config = contactToSpecialistConfig(contact);
  const resolved = bridgeRunner(config);
  return jsonOk(buildAgentCard({ req, agentId, config, resolved }));
}

async function handleMessageSend(args: {
  req: NextRequest;
  agentId: string;
  rpcId: string | number | null;
  method: string;
  params: MessageSendParams | undefined;
}) {
  const { agentId, rpcId, method, params } = args;
  const contact = getAgentContact(agentId);
  if (!contact) {
    return jsonRpcError({
      id: rpcId,
      code: -32004,
      message: "agent not found",
      status: 404,
    });
  }
  const prompt = promptFromMessage(params);
  if (!prompt) {
    return jsonRpcError({
      id: rpcId,
      code: -32602,
      message: "message.parts text is required",
    });
  }
  const config = contactToSpecialistConfig(contact);
  const resolved = bridgeRunner(config);
  const runId = makeRunId(agentId);
  const tType = executionTaskType(agentId, params);

  await persistRunStart({
    runId,
    agentId,
    executionStatus: resolved.executionStatus,
    method,
    taskType: tType,
    prompt,
    sandbox: resolved.sandbox,
  });

  if (
    resolved.executionStatus === "mock_unconnected" ||
    resolved.executionStatus === "needs_vendor_a2a_endpoint"
  ) {
    const errorText = [
      `# ${config.display_name} unavailable`,
      "",
      EXECUTION_STATUS_DESCRIPTIONS[resolved.executionStatus],
      "",
      `Execution status: ${resolved.executionStatus}`,
      `Active mock policy: ${currentMockPolicy()}`,
      "",
      "Arbor will not substitute a ChatGPT placeholder for this A2A request.",
      "Set ARBOR_MOCK_POLICY=demo_mock_llm to allow a disclosed sandbox run instead.",
    ].join("\n");
    await persistRunFailure({ runId, message: errorText });
    return jsonOk({
      jsonrpc: "2.0",
      id: rpcId,
      result: buildFailureTask({
        runId,
        text: errorText,
        metadata: {
          execution: {
            execution_status: resolved.executionStatus,
            native_connection: resolved.nativeConnection,
            sandbox: resolved.sandbox,
            ...mockPolicyMetadata(
              mockPolicyForExecutionStatus(resolved.executionStatus),
            ),
          },
        },
      }),
    });
  }

  await persistRunWorking(runId);

  let sandboxArtifact: SandboxArtifact | undefined;
  let text: string;
  let runnerArtifact: unknown;
  let vendorError: string | undefined;
  let sandboxFellBack = false;
  try {
    if (resolved.sandbox) {
      sandboxArtifact = await runSandboxA2AExecution({
        config,
        prompt,
        taskType: tType,
      });
      text = sandboxArtifact.markdown;
      runnerArtifact = sandboxArtifact;
    } else {
      try {
        const output = await resolved.runner.execute(prompt, tType);
        if (typeof output === "string") {
          text = output;
        } else {
          text = output.summary;
          runnerArtifact = output;
        }
      } catch (vendorErr) {
        // Native vendor unreachable: if sandbox is enabled, fall back with a
        // disclosure rather than failing the chat entirely. Otherwise rethrow
        // so the outer catch reports the vendor error honestly.
        if (resolved.executionStatus === "native_a2a" && isSandboxA2AEnabled()) {
          vendorError = vendorErr instanceof Error ? vendorErr.message : String(vendorErr);
          sandboxArtifact = await runSandboxA2AExecution({
            config,
            prompt,
            taskType: tType,
          });
          text = [
            `> Vendor A2A endpoint failed: ${vendorError}`,
            `> Falling back to ${SANDBOX_DISCLOSURE_TEXT}`,
            "",
            sandboxArtifact.markdown,
          ].join("\n");
          runnerArtifact = sandboxArtifact;
          sandboxFellBack = true;
        } else {
          throw vendorErr;
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorText = [
      `# ${config.display_name} execution failed`,
      "",
      "The Arbor A2A bridge accepted the task, but the configured execution runner could not complete it.",
      "",
      `Runner error: ${message}`,
      "",
      `Execution status: ${resolved.executionStatus}`,
      `Vendor endpoint: ${config.a2a_endpoint ?? config.a2a_agent_card_url ?? "(none)"}`,
      `Sandbox: ${resolved.sandbox ? "yes" : "no"}`,
      "",
      isSandboxA2AEnabled()
        ? "Demo mock LLM policy is enabled but did not apply to this status. This failure is returned honestly."
        : "Set ARBOR_MOCK_POLICY=demo_mock_llm to let Arbor fall back to a disclosed sandbox run when the vendor endpoint is unreachable.",
    ].join("\n");
    await persistRunFailure({ runId, message: errorText });
    return jsonOk({
      jsonrpc: "2.0",
      id: rpcId,
      result: buildFailureTask({
        runId,
        text: errorText,
        metadata: {
          execution: {
            execution_status: resolved.executionStatus,
            native_connection: resolved.nativeConnection,
            sandbox: resolved.sandbox,
            vendor_endpoint:
              config.a2a_endpoint ?? config.a2a_agent_card_url ?? null,
            error: message,
            ...mockPolicyMetadata(
              mockPolicyForExecutionStatus(resolved.executionStatus),
            ),
          },
        },
      }),
    });
  }

  const task = buildSuccessTask({
    runId,
    agentId,
    text,
    description: config.one_liner,
    artifactData: {
      execution: {
        execution_status: resolved.executionStatus,
        native_connection: resolved.nativeConnection,
        sandbox: resolved.sandbox,
        sandbox_disclosure: resolved.sandbox ? SANDBOX_DISCLOSURE_TEXT : null,
        task_type: tType,
        request_method: method,
        ...mockPolicyMetadata(
          mockPolicyForExecutionStatus(resolved.executionStatus),
        ),
      },
      artifact: runnerArtifact,
    },
    metadata: {
      execution: {
        execution_status: resolved.executionStatus,
        sandbox: resolved.sandbox,
        ...mockPolicyMetadata(
          mockPolicyForExecutionStatus(resolved.executionStatus),
        ),
      },
    },
  });

  await persistRunComplete({ runId, artifact: task });

  return jsonOk({
    jsonrpc: "2.0",
    id: rpcId,
    result: task,
  });
}

async function handleTasksGet(args: {
  rpcId: string | number | null;
  params: TasksGetParams | undefined;
}) {
  const taskId = args.params?.id?.trim();
  if (!taskId) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32602,
      message: "tasks/get requires params.id",
    });
  }
  const row = await persistedRun(taskId);
  if (!row) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32001,
      message: `task ${taskId} not found`,
      status: 404,
    });
  }
  const state = row.state;
  const text =
    row.error_message ??
    (row.artifact && typeof (row.artifact as { status?: { message?: unknown } }).status === "object"
      ? // Stored artifact is the full A2A task shape; surface its message text.
        promptFromMessage({
          message: (row.artifact as { status?: { message?: { parts?: MessagePart[] } } }).status?.message,
        })
      : `Task ${taskId} is currently ${state}.`);
  return jsonOk({
    jsonrpc: "2.0",
    id: args.rpcId,
    result: {
      id: row.run_id,
      kind: "task",
      status: {
        state,
        message: {
          role: "agent",
          parts: [{ kind: "text", text: text || `Task is ${state}.` }],
        },
      },
      artifacts:
        row.artifact &&
        typeof (row.artifact as { artifacts?: unknown }).artifacts !== "undefined"
          ? ((row.artifact as { artifacts: unknown }).artifacts as unknown[])
          : [],
      metadata: {
        execution_status: row.execution_status,
        sandbox: row.execution_status === "arbor_sandbox_adapter",
        cancel_requested: row.cancel_requested,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    },
  });
}

async function handleTasksCancel(args: {
  rpcId: string | number | null;
  params: TasksCancelParams | undefined;
}) {
  const taskId = args.params?.id?.trim();
  if (!taskId) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32602,
      message: "tasks/cancel requires params.id",
    });
  }
  const result = await persistRunCancel(taskId);
  if (!result || result.notFound) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32001,
      message: `task ${taskId} not found`,
      status: 404,
    });
  }
  if (result.terminal) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32002,
      message: `task ${taskId} is already in terminal state ${result.state}`,
    });
  }
  return jsonOk({
    jsonrpc: "2.0",
    id: args.rpcId,
    result: {
      id: taskId,
      kind: "task",
      status: {
        state: "canceled",
        message: {
          role: "agent",
          parts: [{ kind: "text", text: `Task ${taskId} canceled.` }],
        },
      },
      artifacts: [],
    },
  });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { agentId } = await params;
  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError({
      id: null,
      code: -32700,
      message: "invalid JSON body",
      status: 400,
    });
  }
  const rpcId = body.id ?? null;
  const method = body.method ?? "";

  if (method === "message/send" || method === "tasks/send") {
    return await handleMessageSend({
      req,
      agentId,
      rpcId,
      method,
      params: body.params as MessageSendParams | undefined,
    });
  }
  if (method === "tasks/get") {
    return await handleTasksGet({
      rpcId,
      params: body.params as TasksGetParams | undefined,
    });
  }
  if (method === "tasks/cancel") {
    return await handleTasksCancel({
      rpcId,
      params: body.params as TasksCancelParams | undefined,
    });
  }
  return jsonRpcError({
    id: rpcId,
    code: -32601,
    message: `unsupported A2A method: ${method || "missing"}`,
  });
}

export function OPTIONS() {
  return corsPreflight();
}
