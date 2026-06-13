/**
 * Arbor A2A Worker — standalone A2A v0.3.0 execution agent.
 *
 * CONSTRAINT: This server requires a persistent in-memory process. Do NOT deploy
 * on serverless runtimes (Vercel Edge/Functions, AWS Lambda, etc.) — the in-memory
 * task Map will not survive between requests. Use any long-lived Node host:
 * Railway, Fly.io, a VPS, Docker, PM2, etc. Configure PORT env for the listen port.
 *
 * This service imports NOTHING from the parent Arbor repo. It is a genuine external
 * process that speaks A2A v0.3.0 JSON-RPC and can be registered as a specialist.
 */

import * as http from "node:http";

// ─── config ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const WORKER_PUBLIC_URL =
  process.env.WORKER_PUBLIC_URL ?? `http://localhost:${PORT}/`;
const WORKER_BEARER_TOKEN = process.env.WORKER_BEARER_TOKEN ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MODEL_PROVIDER = (process.env.ARBOR_MODEL_PROVIDER ?? "openai").toLowerCase();
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? "";
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY ?? "";
const AZURE_OPENAI_API_MODE =
  (process.env.AZURE_OPENAI_API_MODE ?? "responses").toLowerCase() === "chat"
    ? "chat"
    : "responses";
const AZURE_OPENAI_API_VERSION =
  process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";
const AZURE_OPENAI_AGENT_DEPLOYMENT =
  process.env.AZURE_OPENAI_AGENT_DEPLOYMENT ??
  process.env.AZURE_OPENAI_DEPLOYMENT ??
  process.env.ARBOR_AGENT_MODEL ??
  "";
const MAX_REQUEST_BODY_BYTES = Number.parseInt(
  process.env.MAX_REQUEST_BODY_BYTES ?? "1048576",
  10,
);

// ─── A2A types ────────────────────────────────────────────────────────────────

type TaskState = "submitted" | "working" | "completed" | "failed";

interface TextPart {
  kind: "text";
  text: string;
}

interface DataPart {
  kind: "data";
  data: unknown;
}

type ArtifactPart = TextPart | DataPart;

interface A2AArtifact {
  name?: string;
  description?: string;
  parts: ArtifactPart[];
}

interface A2ATask {
  id: string;
  kind: "task";
  status: {
    state: TaskState;
    message?: {
      role: string;
      parts: Array<{ kind: "text"; text: string }>;
    };
  };
  artifacts: A2AArtifact[];
  metadata?: Record<string, unknown>;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

// ─── in-memory task store ─────────────────────────────────────────────────────

const tasks = new Map<string, A2ATask>();

function makeTaskId(): string {
  return `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── agent card ───────────────────────────────────────────────────────────────

function buildAgentCard(): Record<string, unknown> {
  const hasBearerAuth = Boolean(WORKER_BEARER_TOKEN);
  return {
    protocolVersion: "0.3.0",
    name: "Arbor Worker",
    description:
      "Generalist execution worker that produces real written deliverables in markdown. Handles copywriting, summarization, research briefs, code explanation, and general analysis tasks using LLM inference.",
    url: WORKER_PUBLIC_URL,
    version: "1.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/markdown", "text/plain"],
    skills: [
      {
        id: "copywriting",
        name: "Copywriting",
        description:
          "Write marketing copy, ad headlines, landing page content, email campaigns, and other persuasive written content.",
        tags: [
          "writing",
          "copy",
          "copywriting",
          "content",
          "marketing",
          "ads",
          "email",
          "landing-page",
          "persuasion",
        ],
      },
      {
        id: "summarization",
        name: "Summarization",
        description:
          "Summarize long documents, articles, reports, transcripts, or any text into concise, actionable summaries.",
        tags: [
          "summary",
          "summarize",
          "summarization",
          "condense",
          "tldr",
          "digest",
          "brief",
          "writing",
        ],
      },
      {
        id: "research-brief",
        name: "Research Brief",
        description:
          "Produce structured research briefs, market analyses, competitive landscapes, and background reports on any topic.",
        tags: [
          "research",
          "brief",
          "analysis",
          "report",
          "market",
          "competitive",
          "landscape",
          "writing",
          "writing-tasks",
        ],
      },
      {
        id: "code-explanation",
        name: "Code Explanation",
        description:
          "Explain code snippets, libraries, architectures, or technical concepts in clear, accessible prose with examples.",
        tags: [
          "code",
          "explanation",
          "explain",
          "documentation",
          "docs",
          "technical",
          "developer",
          "programming",
        ],
      },
      {
        id: "general-analysis",
        name: "General Analysis",
        description:
          "Perform open-ended analysis, answer questions, break down problems, and produce structured written deliverables on any topic.",
        tags: [
          "general",
          "analysis",
          "writing",
          "writing-tasks",
          "questions",
          "breakdown",
          "structured",
          "content",
          "report",
        ],
      },
    ],
    ...(hasBearerAuth
      ? {
          securitySchemes: {
            bearer: { type: "http", scheme: "bearer" },
          },
          security: [{ bearer: [] }],
        }
      : {
          securitySchemes: {},
          security: [],
        }),
  };
}

// ─── task builders ────────────────────────────────────────────────────────────

function buildWorkingTask(id: string): A2ATask {
  return {
    id,
    kind: "task",
    status: { state: "working" },
    artifacts: [],
  };
}

function buildCompletedTask(args: {
  id: string;
  artifactText: string;
  artifactName?: string;
  artifactDescription?: string;
  metadata?: Record<string, unknown>;
}): A2ATask {
  return {
    id: args.id,
    kind: "task",
    status: {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ kind: "text", text: args.artifactText.slice(0, 300) }],
      },
    },
    artifacts: [
      {
        name: args.artifactName ?? "arbor-worker-artifact",
        description:
          args.artifactDescription ??
          "Deliverable produced by the Arbor A2A worker",
        parts: [{ kind: "text", text: args.artifactText }],
      },
    ],
    metadata: args.metadata,
  };
}

function buildFailedTask(args: {
  id: string;
  errorText: string;
  metadata?: Record<string, unknown>;
}): A2ATask {
  return {
    id: args.id,
    kind: "task",
    status: {
      state: "failed",
      message: {
        role: "agent",
        parts: [{ kind: "text", text: args.errorText }],
      },
    },
    artifacts: [],
    metadata: args.metadata,
  };
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function rpcOk(id: string | number | null, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });
}

// ─── model call ───────────────────────────────────────────────────────────────

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "").replace(/\/openai\/v1$/i, "");
}

function appendPath(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function extractResponsesText(json: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (json.output_text) return json.output_text;
  const text = json.output
    ?.flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  if (!text) throw new Error("model response missing output text");
  return text;
}

async function postJSON(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "(no body)");
    throw new Error(
      `model API returned HTTP ${res.status}: ${bodyText.slice(0, 300)}`,
    );
  }

  return await res.json();
}

async function callOpenAI(prompt: string): Promise<string> {
  if (["off", "disable", "disabled", "none"].includes(MODEL_PROVIDER)) {
    throw new Error("ARBOR_MODEL_PROVIDER=disabled — worker model calls are off");
  }
  if (["azure", "azure-openai", "aoai"].includes(MODEL_PROVIDER)) {
    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_AGENT_DEPLOYMENT) {
      throw new Error(
        "Azure OpenAI worker mode needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_AGENT_DEPLOYMENT",
      );
    }
  } else if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set — the worker cannot produce a deliverable without an LLM backend",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  let res: Response;
  try {
    if (["azure", "azure-openai", "aoai"].includes(MODEL_PROVIDER)) {
      const endpoint = normalizeEndpoint(AZURE_OPENAI_ENDPOINT);
      if (AZURE_OPENAI_API_MODE === "responses") {
        const json = (await postJSON(
          appendPath(endpoint, "/openai/v1/responses"),
          { "api-key": AZURE_OPENAI_API_KEY },
          {
            model: AZURE_OPENAI_AGENT_DEPLOYMENT,
            instructions:
              "You are a senior generalist specialist. Produce complete, concrete, ready-to-use deliverables in markdown. Do not hedge, do not ask clarifying questions — work with what you have and deliver the best possible artifact.",
            input: prompt,
          },
          controller.signal,
        )) as {
          output_text?: string;
          output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        };
        return extractResponsesText(json);
      }

      const json = (await postJSON(
        `${appendPath(
          endpoint,
          `/openai/deployments/${encodeURIComponent(
            AZURE_OPENAI_AGENT_DEPLOYMENT,
          )}/chat/completions`,
        )}?api-version=${encodeURIComponent(AZURE_OPENAI_API_VERSION)}`,
        { "api-key": AZURE_OPENAI_API_KEY },
        {
          messages: [
            {
              role: "system",
              content:
                "You are a senior generalist specialist. Produce complete, concrete, ready-to-use deliverables in markdown. Do not hedge, do not ask clarifying questions — work with what you have and deliver the best possible artifact.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        },
        controller.signal,
      )) as { choices?: Array<{ message?: { content?: string } }> };
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new Error("model response missing choices[0].message.content");
      return text;
    }

    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a senior generalist specialist. Produce complete, concrete, ready-to-use deliverables in markdown. Do not hedge, do not ask clarifying questions — work with what you have and deliver the best possible artifact.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(
      `OpenAI API returned HTTP ${res.status}: ${body.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI response missing choices[0].message.content");
  }
  return text;
}

// ─── async task execution (fire-and-forget) ───────────────────────────────────

function runTaskAsync(taskId: string, prompt: string): void {
  (async () => {
    try {
      const text = await callOpenAI(prompt);
      const completed = buildCompletedTask({
        id: taskId,
        artifactText: text,
        metadata: {
          model: ["azure", "azure-openai", "aoai"].includes(MODEL_PROVIDER)
            ? AZURE_OPENAI_AGENT_DEPLOYMENT
            : OPENAI_MODEL,
          model_provider: MODEL_PROVIDER,
          completed_at: new Date().toISOString(),
        },
      });
      tasks.set(taskId, completed);
      console.log(`[arbor-worker] task ${taskId} completed`);
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : String(err);
      const failed = buildFailedTask({ id: taskId, errorText });
      tasks.set(taskId, failed);
      console.log(`[arbor-worker] task ${taskId} failed: ${errorText}`);
    }
  })();
}

// ─── request body reader ──────────────────────────────────────────────────────

class RequestBodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`request body exceeded ${limit} bytes`);
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (Number.isFinite(MAX_REQUEST_BODY_BYTES) && total > MAX_REQUEST_BODY_BYTES) {
        reject(new RequestBodyTooLargeError(MAX_REQUEST_BODY_BYTES));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ─── auth check ───────────────────────────────────────────────────────────────

function checkBearer(req: http.IncomingMessage): boolean {
  if (!WORKER_BEARER_TOKEN) return true; // no auth required
  const auth = req.headers["authorization"] ?? "";
  return auth === `Bearer ${WORKER_BEARER_TOKEN}`;
}

// ─── prompt extraction ────────────────────────────────────────────────────────

interface MessageSendParams {
  message?: {
    parts?: Array<{ kind?: string; type?: string; text?: string }>;
  };
  metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMessageSendParams(
  value: unknown,
): MessageSendParams | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const message = value.message;
  if (message !== undefined && !isRecord(message)) return null;
  const parts = message?.parts;
  if (parts !== undefined && !Array.isArray(parts)) return null;
  if (
    Array.isArray(parts) &&
    parts.some((part) => !isRecord(part) || (part.text !== undefined && typeof part.text !== "string"))
  ) {
    return null;
  }
  const metadata = value.metadata;
  if (metadata !== undefined && !isRecord(metadata)) return null;
  return value as MessageSendParams;
}

function normalizeTasksGetParams(value: unknown): { id?: string } | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (value.id !== undefined && typeof value.id !== "string") return null;
  return value as { id?: string };
}

function extractPrompt(params: MessageSendParams | undefined): string {
  return (
    params?.message?.parts
      ?.filter((p) => (p.kind === "text" || p.type === "text") && p.text)
      .map((p) => p.text!)
      .join("\n") ?? ""
  );
}

function extractIntent(params: MessageSendParams | undefined): string {
  const raw = params?.metadata?.intent;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "post_task";
}

// ─── cost estimate ────────────────────────────────────────────────────────────

function computeCostEstimate(prompt: string): {
  cost_estimate: number;
  estimated_seconds: number;
} {
  const costRaw = 0.35 + Math.min(0.65, prompt.length / 4000);
  const cost_estimate = Math.round(costRaw * 100) / 100;
  const estimated_seconds = 20 + Math.min(40, Math.floor(prompt.length / 200));
  return { cost_estimate, estimated_seconds };
}

/**
 * Bid plans: Arbor's auctioneer screens every bid for a plausible,
 * task-specific plan. Draft one with the model behind this worker, capped
 * well under Arbor's 12s bid timeout; fall back to nothing on any failure
 * (the quote text alone still names the price and time).
 */
async function draftBidPlan(prompt: string): Promise<string | null> {
  if (!prompt.trim()) return null;
  try {
    const plan = await Promise.race([
      callOpenAI(
        `This is a bid request, not the task itself. In 2-4 numbered steps (2-3 sentences total, plain text, no preamble), state exactly how you would complete this task:\n\n${prompt.slice(0, 2000)}`,
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("plan draft timeout (8s)")), 8_000),
      ),
    ]);
    const trimmed = plan.trim();
    return trimmed.length >= 40 ? trimmed.slice(0, 700) : null;
  } catch (err) {
    console.warn(
      `[arbor-worker] bid plan draft failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─── JSON-RPC method handlers ─────────────────────────────────────────────────

async function handleMessageSend(
  rpcId: string | number | null,
  rawParams: unknown,
): Promise<string> {
  const params = normalizeMessageSendParams(rawParams);
  if (params === null) {
    return rpcError(rpcId, -32602, "message/send requires object params with message.parts");
  }
  const prompt = extractPrompt(params);
  const intent = extractIntent(params);

  console.log(
    `[arbor-worker] message/send intent=${intent} promptLen=${prompt.length}`,
  );

  if (intent === "probe") {
    const taskId = makeTaskId();
    const task = buildCompletedTask({
      id: taskId,
      artifactText: "arbor-worker probe ok",
      artifactName: "probe-result",
      artifactDescription: "Probe ping response",
    });
    tasks.set(taskId, task);
    return rpcOk(rpcId, task);
  }

  if (intent === "cost_estimate") {
    const taskId = makeTaskId();
    const { cost_estimate, estimated_seconds } = computeCostEstimate(prompt);
    const plan = await draftBidPlan(prompt);
    const quoteText = plan
      ? `${plan}\n\nCost estimate: $${cost_estimate.toFixed(2)} | Estimated time: ${estimated_seconds}s`
      : `Cost estimate: $${cost_estimate.toFixed(2)} | Estimated time: ${estimated_seconds}s`;
    const task = buildCompletedTask({
      id: taskId,
      artifactText: quoteText,
      artifactName: "cost-estimate",
      artifactDescription: "Plan, cost, and time estimate for this task",
      metadata: { cost_estimate, estimated_seconds },
    });
    tasks.set(taskId, task);
    return rpcOk(rpcId, task);
  }

  // post_task (default) — respond immediately with working, run async
  const taskId = makeTaskId();
  const working = buildWorkingTask(taskId);
  tasks.set(taskId, working);

  console.log(`[arbor-worker] task ${taskId} started (working)`);
  runTaskAsync(taskId, prompt || "No prompt provided.");

  return rpcOk(rpcId, working);
}

function handleTasksGet(
  rpcId: string | number | null,
  rawParams: unknown,
): string {
  const params = normalizeTasksGetParams(rawParams);
  if (params === null) {
    return rpcError(rpcId, -32602, "tasks/get requires object params with string id");
  }
  const taskId = params?.id?.trim();
  if (!taskId) {
    return rpcError(rpcId, -32602, "tasks/get requires params.id");
  }
  const task = tasks.get(taskId);
  if (!task) {
    return rpcError(rpcId, -32001, `task not found: ${taskId}`);
  }
  console.log(
    `[arbor-worker] tasks/get id=${taskId} state=${task.status.state}`,
  );
  return rpcOk(rpcId, task);
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  // Agent card endpoints
  if (
    method === "GET" &&
    (url === "/.well-known/agent-card.json" ||
      url === "/.well-known/agent.json")
  ) {
    const card = buildAgentCard();
    const body = JSON.stringify(card);
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }

  // JSON-RPC endpoint
  if (method === "POST" && (url === "/" || url === "")) {
    // Auth check
    if (!checkBearer(req)) {
      const errBody = rpcError(
        null,
        -32000,
        "Unauthorized: valid Bearer token required",
      );
      res.writeHead(401, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(errBody),
      });
      res.end(errBody);
      return;
    }

    let rawBody: string;
    try {
      rawBody = await readBody(req);
    } catch (err) {
      const tooLarge = err instanceof RequestBodyTooLargeError;
      const errBody = rpcError(
        null,
        tooLarge ? -32013 : -32700,
        tooLarge ? err.message : "failed to read request body",
      );
      res.writeHead(tooLarge ? 413 : 400, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(errBody),
      });
      res.end(errBody);
      return;
    }

    let body: JsonRpcRequest;
    try {
      body = JSON.parse(rawBody) as JsonRpcRequest;
    } catch {
      const errBody = rpcError(null, -32700, "invalid JSON body");
      res.writeHead(400, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(errBody),
      });
      res.end(errBody);
      return;
    }

    const rpcId = body.id ?? null;
    const rpcMethod = body.method ?? "";
    const params = body.params;

    let responseBody: string;

    try {
      if (body.jsonrpc !== undefined && body.jsonrpc !== "2.0") {
        responseBody = rpcError(rpcId, -32600, 'jsonrpc must be "2.0"');
      } else if (rpcMethod === "message/send" || rpcMethod === "tasks/send") {
        responseBody = await handleMessageSend(rpcId, params);
      } else if (rpcMethod === "tasks/get") {
        responseBody = handleTasksGet(rpcId, params);
      } else {
        responseBody = rpcError(
          rpcId,
          -32601,
          `method not found: ${rpcMethod || "(missing)"}`,
        );
      }
    } catch (err) {
      responseBody = rpcError(
        rpcId,
        -32603,
        err instanceof Error ? err.message : String(err),
      );
    }

    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(responseBody),
    });
    res.end(responseBody);
    return;
  }

  // 404 for anything else
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`[arbor-worker] listening on port ${PORT}`);
  console.log(`[arbor-worker] public url: ${WORKER_PUBLIC_URL}`);
  console.log(
    `[arbor-worker] bearer auth: ${WORKER_BEARER_TOKEN ? "enabled" : "disabled"}`,
  );
  console.log(`[arbor-worker] openai key: ${OPENAI_API_KEY ? "set" : "NOT SET (tasks will fail)"}`);
});
