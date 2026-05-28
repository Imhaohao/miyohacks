/**
 * A2A-forwarding specialist runner.
 *
 * For specialists with `a2a_endpoint` set (tier:"a2a"), both bid and execute
 * are dispatched to the remote A2A agent via the A2A v0.3.0 JSON-RPC protocol:
 *
 *   1. At bid time, POST `message/send` to the endpoint with a cost-estimate
 *      intent. If the remote cannot honor it, fall back to cfg.cost_baseline.
 *   2. At execute time, POST `message/send` / `tasks/send`, then poll
 *      `tasks/get` until the task reaches a terminal state (completed/failed).
 *      On success, extract text from the first artifact part and return with
 *      provenance { tier:"a2a", live_tools_called:true, endpoint }.
 *      On failure (timeout, network error, remote "failed" state): return a
 *      [FALLBACK] banner with provenance live_tools_called:false, fallback_reason.
 *      No persona-LLM fallback — the auctioneer should pick another bidder.
 *
 * Request/response shapes follow what Arbor's own /api/a2a/market route emits
 * (see app/api/a2a/market/route.ts and convex/a2aTaskRuns.ts).
 */

import { buildTaskContext } from "../campaign-context";
import { getAuthForEndpoint } from "./a2a-agent-card";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistRunner,
  BidPayload,
  SpecialistOutput,
  SpecialistExecuteResult,
  SpecialistProvenance,
} from "../types";

// ─── A2A protocol types ───────────────────────────────────────────────────

interface A2AMessagePart {
  kind?: "text" | "data";
  type?: string;
  text?: string;
  data?: unknown;
}

interface A2ATaskStatus {
  state: "submitted" | "working" | "completed" | "failed";
  message?: {
    role: string;
    parts: A2AMessagePart[];
  };
}

interface A2AArtifact {
  name?: string;
  description?: string;
  parts: A2AMessagePart[];
}

interface A2ATask {
  id: string;
  kind: "task";
  status: A2ATaskStatus;
  artifacts: A2AArtifact[];
  metadata?: Record<string, unknown>;
}

interface JsonRpcOk {
  jsonrpc: string;
  id?: string | number | null;
  result: A2ATask;
}

// ─── constants ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1_500;
const POLL_MAX_ATTEMPTS = 40; // up to 60 s
const SEND_TIMEOUT_MS = 15_000;
const POLL_TIMEOUT_MS = 5_000;
const BID_TIMEOUT_MS = 12_000;

// ─── helpers ──────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label}: timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function nextRpcId(): string {
  return `arbor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function postJsonRpc(
  endpoint: string,
  method: string,
  params: unknown,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<JsonRpcOk> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: nextRpcId(),
    method,
    params,
  });
  const res = await withTimeout(
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body,
    }),
    timeoutMs,
    `POST ${method}`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`A2A ${method} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { error?: { message: string }; result?: A2ATask };
  if (json.error) {
    throw new Error(`A2A JSON-RPC error: ${json.error.message}`);
  }
  if (!json.result || json.result.kind !== "task") {
    throw new Error(`A2A response missing result.kind="task"`);
  }
  return json as JsonRpcOk;
}

/** Poll `tasks/get` until terminal, returning the final A2ATask. */
async function pollUntilTerminal(
  endpoint: string,
  taskId: string,
  authHeaders: Record<string, string> = {},
): Promise<A2ATask> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(POLL_INTERVAL_MS);
    const rpc = await postJsonRpc(
      endpoint,
      "tasks/get",
      { id: taskId },
      POLL_TIMEOUT_MS,
      authHeaders,
    );
    const state = rpc.result.status.state;
    if (state === "completed" || state === "failed") {
      return rpc.result;
    }
    // submitted / working → keep polling
  }
  throw new Error(`A2A task ${taskId} did not reach terminal state after ${POLL_MAX_ATTEMPTS} polls`);
}

/** Extract readable text from the first artifact, falling back to status message. */
function extractText(task: A2ATask): string {
  for (const artifact of task.artifacts ?? []) {
    for (const part of artifact.parts ?? []) {
      if ((part.kind === "text" || part.type === "text") && part.text) {
        return part.text;
      }
    }
  }
  // fall back to status message parts
  for (const part of task.status.message?.parts ?? []) {
    if ((part.kind === "text" || part.type === "text") && part.text) {
      return part.text;
    }
  }
  return JSON.stringify(task.status);
}

// ─── factory ──────────────────────────────────────────────────────────────

export function makeA2aForwardingSpecialist(
  config: SpecialistConfig,
): SpecialistRunner {
  if (!config.a2a_endpoint) {
    throw new Error(
      `makeA2aForwardingSpecialist requires a2a_endpoint on ${config.agent_id}`,
    );
  }
  const endpoint = config.a2a_endpoint;

  return {
    config,

    async bid(prompt, taskType): Promise<SpecialistDecision> {
      // Discover auth requirements from the agent card before sending any
      // request. Fail closed: if the card is unreachable or auth is unsatisfied,
      // decline immediately — never send an auth-less request at an endpoint
      // that requires auth (that's what this work is designed to prevent).
      let auth;
      try {
        auth = await getAuthForEndpoint(endpoint, config);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          decline: true,
          reason: `agent card unreachable: ${reason.slice(0, 200)}`,
        };
      }
      if (auth.kind === "decline") {
        return { decline: true, reason: auth.reason };
      }

      // Build auth headers for outbound requests.
      const authHeaders: Record<string, string> =
        auth.kind === "bearer"
          ? { Authorization: `Bearer ${auth.token}` }
          : auth.kind === "api-key"
            ? { [auth.headerName]: auth.token }
            : {};

      // Send a cost-estimate intent. If the remote doesn't understand it or
      // fails, we fall back to cfg.cost_baseline so bidding stays cheap.
      const context = buildTaskContext(prompt, taskType);
      try {
        const rpc = await withTimeout(
          postJsonRpc(
            endpoint,
            "message/send",
            {
              message: {
                parts: [{ kind: "text", text: context }],
              },
              metadata: {
                intent: "cost_estimate",
                agent_id: config.agent_id,
              },
            },
            BID_TIMEOUT_MS,
            authHeaders,
          ),
          BID_TIMEOUT_MS,
          "a2a-bid",
        );
        // If the remote completed and gave us a numeric cost in metadata, use it.
        const meta = rpc.result.metadata ?? {};
        const remoteCost =
          typeof meta.cost_estimate === "number" ? meta.cost_estimate : null;
        const bid: BidPayload = {
          bid_price: remoteCost ?? config.cost_baseline,
          capability_claim: `${config.display_name} via A2A at ${endpoint}`,
          estimated_seconds: typeof meta.estimated_seconds === "number"
            ? (meta.estimated_seconds as number)
            : 30,
        };
        return bid;
      } catch (err) {
        // Endpoint unreachable at bid time → decline cleanly so the auctioneer
        // can route elsewhere. Do NOT fall through to mock.
        const reason = err instanceof Error ? err.message : String(err);
        return {
          decline: true,
          reason: `A2A endpoint unreachable during bid: ${reason.slice(0, 200)}`,
        };
      }
    },

    async execute(prompt, taskType): Promise<SpecialistExecuteResult> {
      // Defensive: resolve auth again (module cache makes this essentially free
      // on the second call). If bid somehow declined and execute is still reached,
      // return a clear fallback rather than blasting an auth-less request.
      let auth;
      try {
        auth = await getAuthForEndpoint(endpoint, config);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const provenance: SpecialistProvenance = {
          tier: "a2a",
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          fallback_reason: `agent card unreachable: ${reason.slice(0, 300)}`,
          endpoint,
        };
        return {
          output: `[FALLBACK — auth not satisfied]\n\nagent card unreachable: ${reason}`,
          provenance,
        };
      }
      if (auth.kind === "decline") {
        const provenance: SpecialistProvenance = {
          tier: "a2a",
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          fallback_reason: `auth: ${auth.reason}`,
          endpoint,
        };
        return {
          output: `[FALLBACK — auth not satisfied]\n\n${auth.reason}`,
          provenance,
        };
      }

      const authHeaders: Record<string, string> =
        auth.kind === "bearer"
          ? { Authorization: `Bearer ${auth.token}` }
          : auth.kind === "api-key"
            ? { [auth.headerName]: auth.token }
            : {};

      const context = buildTaskContext(prompt, taskType);

      let taskId: string;
      try {
        const sendRpc = await postJsonRpc(
          endpoint,
          "message/send",
          {
            message: {
              parts: [{ kind: "text", text: context }],
            },
            metadata: {
              intent: "post_task",
              agent_id: config.agent_id,
            },
          },
          SEND_TIMEOUT_MS,
          authHeaders,
        );
        taskId = sendRpc.result.id;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const provenance: SpecialistProvenance = {
          tier: "a2a",
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          fallback_reason: `task send failed: ${reason.slice(0, 300)}`,
          endpoint,
        };
        const output: SpecialistOutput =
          `[FALLBACK — A2A endpoint unreachable]\n\nCould not send task to ${endpoint}: ${reason}`;
        return { output, provenance };
      }

      // Poll until terminal state.
      let finalTask: A2ATask;
      try {
        finalTask = await withTimeout(
          pollUntilTerminal(endpoint, taskId, authHeaders),
          POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS + POLL_TIMEOUT_MS + 2_000,
          "a2a-poll",
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const provenance: SpecialistProvenance = {
          tier: "a2a",
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          external_task_id: taskId,
          fallback_reason: `poll timeout or error: ${reason.slice(0, 300)}`,
          endpoint,
        };
        const output: SpecialistOutput =
          `[FALLBACK — A2A endpoint unreachable]\n\nTask ${taskId} did not complete: ${reason}`;
        return { output, provenance };
      }

      // Terminal state reached. Check success vs failure.
      if (finalTask.status.state === "failed") {
        const errorText = extractText(finalTask);
        const provenance: SpecialistProvenance = {
          tier: "a2a",
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          external_task_id: taskId,
          fallback_reason: `remote task failed: ${errorText.slice(0, 200)}`,
          endpoint,
        };
        const output: SpecialistOutput =
          `[FALLBACK — A2A endpoint unreachable]\n\nRemote task ${taskId} failed: ${errorText}`;
        return { output, provenance };
      }

      // Completed successfully.
      const text = extractText(finalTask);
      const provenance: SpecialistProvenance = {
        tier: "a2a",
        live_tools_called: true,
        transport: "a2a",
        proof_level: "agent_session",
        external_task_id: taskId,
        endpoint,
      };
      return { output: text, provenance };
    },
  };
}
