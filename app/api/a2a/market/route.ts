/**
 * Buyer-facing A2A v0.3.0 gateway for the Arbor market.
 *
 * Maps standard `message/send` calls onto the four protocol-core MCP tools
 * (`post_task`, `get_task`, `list_specialists`, `raise_dispute`) via
 * `metadata.intent`. A2A clients that do not understand the `intents`
 * extension still get a usable agent (default intent is `post_task` with
 * the prompt taken from `message.parts[].text`).
 *
 * Intent map:
 *   discover      -> list_specialists
 *   post_task     -> post_task
 *   get_task      -> get_task
 *   raise_dispute -> raise_dispute
 *
 * Per-call state is persisted in the `a2a_task_runs` Convex table so
 * `tasks/get` on this route returns the same artifact shape it returned
 * at message/send time.
 */

import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { corsPreflight, jsonOk } from "@/lib/http";
import { dispatchTool } from "@/lib/mcp-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const A2A_PROTOCOL_VERSION = "0.3.0";
const MARKET_AGENT_ID = "arbor-market";
const MARKET_EXTENSION_URI = "https://arbor.dev/a2a/extensions/market";

// ─── intent map ──────────────────────────────────────────────────────────

const INTENT_TO_TOOL = {
  discover: "list_specialists",
  post_task: "post_task",
  get_task: "get_task",
  raise_dispute: "raise_dispute",
} as const;

type MarketIntent = keyof typeof INTENT_TO_TOOL;

const INTENT_DESCRIPTIONS: Record<MarketIntent, string> = {
  discover:
    "List specialists with reputation, connection status, and the market_ready flag.",
  post_task:
    "Post a work brief with max_budget. The auction opens immediately.",
  get_task: "Fetch the latest state of a posted task by task_id.",
  raise_dispute: "Reopen a completed task for the judge to re-evaluate.",
};

// ─── JSON-RPC + helpers ──────────────────────────────────────────────────

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

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function marketUrl(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = "/api/a2a/market";
  url.search = "";
  return url.toString();
}

function promptFromMessage(params: MessageSendParams | undefined): string {
  return (
    params?.message?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => Boolean(text?.trim()))
      .join("\n\n")
      .trim() ?? ""
  );
}

function metadataObject(
  params: MessageSendParams | undefined,
): Record<string, unknown> {
  return (params?.metadata ?? {}) as Record<string, unknown>;
}

function intentFromParams(
  params: MessageSendParams | undefined,
): MarketIntent | { error: string } {
  const raw = metadataObject(params).intent;
  if (raw === undefined || raw === null || raw === "") {
    return "post_task";
  }
  if (typeof raw !== "string") {
    return { error: `metadata.intent must be a string, got ${typeof raw}` };
  }
  const normalized = raw.toLowerCase();
  if (normalized in INTENT_TO_TOOL) {
    return normalized as MarketIntent;
  }
  return {
    error: `unknown intent "${raw}"; supported: ${Object.keys(INTENT_TO_TOOL).join(", ")}`,
  };
}

function argsForIntent(
  intent: MarketIntent,
  params: MessageSendParams | undefined,
): Record<string, unknown> {
  const meta = metadataObject(params);
  const rawParams = meta.params;
  const metaParams: Record<string, unknown> =
    rawParams && typeof rawParams === "object" && !Array.isArray(rawParams)
      ? (rawParams as Record<string, unknown>)
      : {};

  if (intent === "post_task") {
    const messageText = promptFromMessage(params);
    const promptFromMeta =
      typeof metaParams.prompt === "string" && metaParams.prompt.trim()
        ? metaParams.prompt
        : undefined;
    const prompt = promptFromMeta ?? messageText;
    return {
      ...metaParams,
      ...(prompt ? { prompt } : {}),
    };
  }

  return metaParams;
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

function makeRunId() {
  return `arbor-a2a-${MARKET_AGENT_ID}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// ─── A2A task shapes (inlined; no other A2A route exists yet) ────────────

interface A2ATaskShape {
  id: string;
  kind: "task";
  status: {
    state: "submitted" | "working" | "completed" | "failed";
    message?: {
      role: string;
      parts: Array<{ kind: "text"; text: string }>;
    };
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
        name: `${MARKET_AGENT_ID}-artifact`,
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

// ─── persistence (best-effort, never breaks the response) ────────────────

function logPersistenceWarning(event: string, runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[a2a-task-runs] persistence warning", {
    event,
    run_id: runId,
    error: message,
  });
}

async function persistRunStart(args: {
  runId: string;
  intent: MarketIntent;
  tool: string;
  prompt: string;
}) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.start, {
        run_id: args.runId,
        agent_id: MARKET_AGENT_ID,
        intent: args.intent,
        tool: args.tool,
        prompt: args.prompt,
      })
      .catch((error) => logPersistenceWarning("start", args.runId, error));
  } catch (error) {
    logPersistenceWarning("start", args.runId, error);
  }
}

async function persistRunWorking(runId: string) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.setWorking, { run_id: runId })
      .catch((error) => logPersistenceWarning("set_working", runId, error));
  } catch (error) {
    logPersistenceWarning("set_working", runId, error);
  }
}

async function persistRunComplete(args: { runId: string; artifact: unknown }) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.complete, {
        run_id: args.runId,
        artifact: args.artifact,
      })
      .catch((error) => logPersistenceWarning("complete", args.runId, error));
  } catch (error) {
    logPersistenceWarning("complete", args.runId, error);
  }
}

async function persistRunFailure(args: { runId: string; message: string }) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.fail, {
        run_id: args.runId,
        error_message: args.message,
      })
      .catch((error) => logPersistenceWarning("fail", args.runId, error));
  } catch (error) {
    logPersistenceWarning("fail", args.runId, error);
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

// ─── agent card ──────────────────────────────────────────────────────────

function buildMarketAgentCard(req: NextRequest) {
  const url = marketUrl(req);
  const origin = new URL(req.url).origin;
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: "Arbor Market",
    description:
      "A2A gateway to the Arbor market. Buyer agents can discover specialists, post tasks, poll task state, and raise disputes via message/send with metadata.intent.",
    url,
    version: "1.0.0",
    provider: {
      organization: "Arbor",
      url: origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
      extensions: [
        {
          uri: MARKET_EXTENSION_URI,
          required: false,
          description:
            "Arbor market intents: discover, post_task, get_task, raise_dispute via message/send metadata.intent.",
        },
      ],
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/markdown"],
    skills: (Object.keys(INTENT_TO_TOOL) as MarketIntent[]).map((intent) => ({
      id: intent,
      name: intent,
      description: INTENT_DESCRIPTIONS[intent],
      tags: ["arbor", "market", intent],
      inputModes: ["application/json", "text/plain"],
      outputModes: ["application/json", "text/markdown"],
    })),
    security: [],
    securitySchemes: {},
    supportsAuthenticatedExtendedCard: false,
    arbor: {
      market_agent: true,
      intents: Object.fromEntries(
        (Object.keys(INTENT_TO_TOOL) as MarketIntent[]).map((intent) => [
          intent,
          {
            tool: INTENT_TO_TOOL[intent],
            description: INTENT_DESCRIPTIONS[intent],
          },
        ]),
      ),
      supported_methods: ["message/send", "tasks/send", "tasks/get"],
    },
  };
}

// ─── handlers ────────────────────────────────────────────────────────────

function summarizeResult(intent: MarketIntent, result: unknown): string {
  if (intent === "discover" && Array.isArray(result)) {
    const ready = result.filter(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        (row as { market_ready?: boolean }).market_ready === true,
    ).length;
    return `discover: ${result.length} specialists (${ready} market_ready)`;
  }
  if (intent === "post_task" && result && typeof result === "object") {
    const r = result as { task_id?: unknown; web_view_url?: unknown };
    if (typeof r.task_id === "string") {
      return `post_task: ${r.task_id}${typeof r.web_view_url === "string" ? ` (${r.web_view_url})` : ""}`;
    }
  }
  if (intent === "get_task" && result && typeof result === "object") {
    const r = result as { task?: { status?: unknown } };
    if (r.task && typeof r.task === "object") {
      const status = (r.task as { status?: unknown }).status;
      if (typeof status === "string") {
        return `get_task: status=${status}`;
      }
    }
  }
  if (intent === "raise_dispute") {
    return `raise_dispute accepted`;
  }
  return `${intent} completed`;
}

async function handleMessageSend(args: {
  rpcId: string | number | null;
  params: MessageSendParams | undefined;
}) {
  const { rpcId, params } = args;
  const intentResult = intentFromParams(params);
  if (typeof intentResult !== "string") {
    return jsonRpcError({
      id: rpcId,
      code: -32602,
      message: intentResult.error,
    });
  }
  const intent = intentResult;
  const toolName = INTENT_TO_TOOL[intent];
  const toolArgs = argsForIntent(intent, params);
  const runId = makeRunId();
  const promptForRecord =
    intent === "post_task"
      ? typeof toolArgs.prompt === "string"
        ? toolArgs.prompt
        : promptFromMessage(params)
      : JSON.stringify(toolArgs);

  await persistRunStart({
    runId,
    intent,
    tool: toolName,
    prompt: promptForRecord,
  });
  await persistRunWorking(runId);

  try {
    const result = await dispatchTool(toolName, toolArgs);
    const summary = summarizeResult(intent, result);
    const task = buildSuccessTask({
      runId,
      text: summary,
      description: INTENT_DESCRIPTIONS[intent],
      artifactData: { intent, tool: toolName, result },
      metadata: { intent, tool: toolName, market_gateway: true },
    });
    await persistRunComplete({ runId, artifact: task });
    return jsonOk({ jsonrpc: "2.0", id: rpcId, result: task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const text = [
      `# Arbor market ${intent} failed`,
      "",
      message,
      "",
      `Intent: ${intent}`,
      `Tool: ${toolName}`,
    ].join("\n");
    await persistRunFailure({ runId, message: text });
    return jsonOk({
      jsonrpc: "2.0",
      id: rpcId,
      result: buildFailureTask({
        runId,
        text,
        metadata: {
          intent,
          tool: toolName,
          market_gateway: true,
          error: message,
        },
      }),
    });
  }
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
  if (row.artifact && typeof row.artifact === "object") {
    return jsonOk({ jsonrpc: "2.0", id: args.rpcId, result: row.artifact });
  }
  const text =
    row.error_message ?? `Task ${row.run_id} is currently ${row.state}.`;
  return jsonOk({
    jsonrpc: "2.0",
    id: args.rpcId,
    result: {
      id: row.run_id,
      kind: "task",
      status: {
        state: row.state,
        message: {
          role: "agent",
          parts: [{ kind: "text", text }],
        },
      },
      artifacts: [],
      metadata: {
        intent: row.intent,
        market_gateway: true,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    },
  });
}

// ─── route entry points ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return jsonOk(buildMarketAgentCard(req));
}

export async function POST(req: NextRequest) {
  // Read the raw body up front so HMAC verification can sign exactly what
  // the caller sent (re-stringifying parsed JSON loses key order and would
  // break signatures generated against the wire format).
  const rawBody = await req.text();

  // Opt-in HMAC verification. Demos and unsigned A2A clients keep working
  // unless ARBOR_A2A_HMAC_REQUIRED=true is set; that flag flips the gateway
  // into "every inbound POST must be signed" mode.
  if (process.env.ARBOR_A2A_HMAC_REQUIRED === "true") {
    const client = convex();
    const verdict = await client.action(api.a2aAuth.verifyInboundCallback, {
      raw_body: rawBody,
      agent_id: req.headers.get("X-Arbor-Agent") ?? undefined,
      timestamp: req.headers.get("X-Arbor-Timestamp") ?? undefined,
      nonce: req.headers.get("X-Arbor-Nonce") ?? undefined,
      signature: req.headers.get("X-Arbor-Signature") ?? undefined,
    });
    if (!verdict.ok) {
      return new Response(
        JSON.stringify({
          error: verdict.error,
          detail: verdict.detail,
        }),
        {
          status: verdict.status,
          headers: { "content-type": "application/json" },
        },
      );
    }
  }

  let body: JsonRpcRequest;
  try {
    body = rawBody ? (JSON.parse(rawBody) as JsonRpcRequest) : ({} as JsonRpcRequest);
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
      rpcId,
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
    return jsonRpcError({
      id: rpcId,
      code: -32601,
      message:
        "tasks/cancel is not supported on the market gateway in v1; cancel via the protocol task_id on the underlying surface",
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
