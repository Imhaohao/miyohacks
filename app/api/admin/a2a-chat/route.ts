/**
 * Admin console A2A chat.
 *
 * GET  -> list every specialist shown in the market/admin listing, with
 *         A2A-ready entries marked for direct chat.
 * POST -> { agent_id, text, context_id? }: send one user message to that
 *         specialist over A2A JSON-RPC message/send, poll tasks/get to a
 *         terminal state when the reply is a task, and return the agent's
 *         reply text plus the raw protocol payload for debugging.
 */

import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { jsonOk, corsPreflight } from "@/lib/http";
import { SPECIALISTS } from "@/lib/specialists/registry";
import { getAuthForEndpoint } from "@/lib/specialists/a2a-agent-card";
import {
  pollUntilTerminal,
  extractText,
  type A2ATask,
  type A2AMessagePart,
} from "@/lib/specialists/a2a-forwarding";
import type { SpecialistConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kept under typical serverless gateway limits (Vercel Hobby ~10s) so a slow
// or unreachable agent yields a clean JSON 502 from this route rather than an
// HTML gateway-timeout page the client can't parse.
const SEND_TIMEOUT_MS = 9_000;

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

interface DiscoveredRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  capabilities: string[];
  system_prompt: string;
  cost_baseline: number;
  starting_reputation: number;
  one_liner: string;
  mcp_endpoint?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  a2a_auth_mode?: "none" | "card";
  discovery_source?: "catalog" | "registry" | "a2a" | "synthesized";
}

/** Static registry + Convex-discovered rows. */
async function listedSpecialists(): Promise<SpecialistConfig[]> {
  const fromRegistry = SPECIALISTS;
  let discovered: SpecialistConfig[] = [];
  try {
    const rows = (await convex().query(
      api.discoveredSpecialists.list,
      {},
    )) as DiscoveredRow[];
    discovered = rows
      .map((r) => ({
        agent_id: r.agent_id,
        display_name: r.display_name,
        sponsor: r.sponsor,
        capabilities: r.capabilities,
        system_prompt: r.system_prompt,
        cost_baseline: r.cost_baseline,
        starting_reputation: r.starting_reputation,
        one_liner: r.one_liner,
        tier: r.a2a_endpoint
          ? ("a2a" as const)
          : r.mcp_endpoint
            ? ("mcp-forwarding" as const)
            : ("mock" as const),
        mcp_endpoint: r.mcp_endpoint,
        a2a_endpoint: r.a2a_endpoint,
        a2a_agent_card_url: r.a2a_agent_card_url,
        a2a_api_key_env: r.a2a_api_key_env,
        a2a_auth_mode: r.a2a_auth_mode,
        discovered: true,
        discovery_source: r.discovery_source,
      }));
  } catch {
    // Convex unreachable -> registry-only list rather than a hard failure.
  }
  const seen = new Set(fromRegistry.map((s) => s.agent_id));
  return [...fromRegistry, ...discovered.filter((s) => !seen.has(s.agent_id))];
}

/** Static registry + Convex-discovered rows, filtered to A2A-capable. */
async function a2aSpecialists(): Promise<SpecialistConfig[]> {
  return (await listedSpecialists()).filter((s) => s.a2a_endpoint);
}

function chatUnavailableReason(s: SpecialistConfig): string | undefined {
  if (s.a2a_endpoint) return undefined;
  if (s.mcp_endpoint) return "MCP specialist; not directly reachable over A2A.";
  if (s.tier === "a2a-bridge") {
    return "A2A bridge specialist; use auction flow rather than direct message/send.";
  }
  if (s.tier === "mock") {
    return "Mock/persona specialist; no direct A2A endpoint configured.";
  }
  if (s.tier === "real") {
    return "Native API specialist; no direct A2A endpoint configured.";
  }
  return "No A2A endpoint configured.";
}

export async function GET() {
  const specs = await listedSpecialists();
  return jsonOk({
    specialists: specs.map((s) => ({
      agent_id: s.agent_id,
      display_name: s.display_name,
      sponsor: s.sponsor,
      one_liner: s.one_liner,
      tier: s.tier,
      a2a_endpoint: s.a2a_endpoint,
      chat_ready: Boolean(s.a2a_endpoint),
      chat_unavailable_reason: chatUnavailableReason(s),
      discovered: s.discovered === true,
    })),
  });
}

// ─── message/send (lenient: task OR message reply) ─────────────────────────

interface RawJsonRpc {
  jsonrpc?: string;
  id?: string | number | null;
  result?: { kind?: string; [key: string]: unknown };
  error?: { code?: number; message?: string; data?: unknown };
}

function textFromParts(parts: A2AMessagePart[] | undefined): string {
  // Lenient: many live A2A servers omit the part `kind`/`type` discriminator
  // and just send `{ text }`. Accept any part that carries text.
  for (const p of parts ?? []) {
    if (p && typeof p.text === "string" && p.text) return p.text;
  }
  return "";
}

export async function POST(req: NextRequest) {
  let body: { agent_id?: string; text?: string; context_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonOk({ ok: false, error: "invalid JSON body" }, 400);
  }
  const { agent_id, text, context_id } = body;
  if (!agent_id || !text?.trim()) {
    return jsonOk({ ok: false, error: "agent_id and text are required" }, 400);
  }

  const specs = await a2aSpecialists();
  const cfg = specs.find((s) => s.agent_id === agent_id);
  if (!cfg?.a2a_endpoint) {
    return jsonOk(
      { ok: false, error: `no A2A specialist registered with agent_id "${agent_id}"` },
      404,
    );
  }
  const endpoint = cfg.a2a_endpoint;

  // Key vault hydration: if the specialist needs a key env var that isn't set
  // in the process environment, pull the key from the Convex outbound-key
  // vault (console paste / auto-acquired) so chat works without redeploys.
  if (
    cfg.a2a_auth_mode !== "none" &&
    cfg.a2a_api_key_env &&
    !process.env[cfg.a2a_api_key_env]
  ) {
    try {
      const vaultKey = (await convex().query(api.a2aOutboundKeys.getForAgent, {
        agent_id: cfg.agent_id,
      })) as { api_key: string } | null;
      if (vaultKey?.api_key) {
        process.env[cfg.a2a_api_key_env] = vaultKey.api_key;
      }
    } catch {
      // Vault unreachable — fall through to normal resolution, which will
      // decline with a clear "env var not set" message.
    }
  }

  // Resolve auth from the agent card (fail closed on unsupported schemes).
  const auth = await getAuthForEndpoint(endpoint, cfg);
  if (auth.kind === "decline") {
    return jsonOk(
      {
        ok: false,
        agent_id,
        endpoint,
        error: `auth: ${auth.reason}`,
        // Tells the console UI to render the paste-a-key input for this agent.
        needs_key: /env var .* not set|not configured/.test(auth.reason),
      },
      502,
    );
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth.kind === "bearer") headers.authorization = `Bearer ${auth.token}`;
  if (auth.kind === "api-key") headers[auth.headerName] = auth.token;

  const rpcId = `admin-chat-${Date.now()}`;
  const message: Record<string, unknown> = {
    role: "user",
    kind: "message",
    messageId: crypto.randomUUID(),
    parts: [{ kind: "text", text: text.trim() }],
  };
  if (context_id) message.contextId = context_id;

  let raw: RawJsonRpc;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId,
        method: "message/send",
        params: { message },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      return jsonOk(
        { ok: false, agent_id, endpoint, error: `HTTP ${res.status}: ${errText.slice(0, 300)}` },
        502,
      );
    }
    raw = (await res.json()) as RawJsonRpc;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof Error && err.name === "AbortError";
    return jsonOk(
      {
        ok: false,
        agent_id,
        endpoint,
        error: timedOut
          ? `agent did not respond within ${SEND_TIMEOUT_MS / 1000}s (timed out)`
          : `send failed: ${msg}`,
      },
      504,
    );
  }

  if (raw.error) {
    return jsonOk(
      {
        ok: false,
        agent_id,
        endpoint,
        error: `JSON-RPC error ${raw.error.code ?? ""}: ${raw.error.message ?? "unknown"}`,
        raw,
      },
      502,
    );
  }

  const result = raw.result;

  // Reply may be a plain message (A2A allows message OR task results).
  if (result?.kind === "message") {
    const parts = (result as { parts?: A2AMessagePart[] }).parts;
    return jsonOk({
      ok: true,
      agent_id,
      endpoint,
      kind: "message",
      reply_text: textFromParts(parts) || "(no text parts in reply)",
      context_id: (result as { contextId?: string }).contextId ?? context_id,
      raw,
    });
  }

  // Task detection is lenient: many live servers omit `kind:"task"` and just
  // return the task object (`{id,status,artifacts}`), or wrap it as
  // `result.task`. Normalize all of these to one task object.
  const taskCandidate = (result as { task?: unknown })?.task ?? result;
  const isTaskShape =
    result?.kind === "task" ||
    !!(taskCandidate as { status?: { state?: string } })?.status?.state;

  if (isTaskShape && taskCandidate) {
    let task = taskCandidate as unknown as A2ATask;
    const state = task.status?.state as string | undefined;
    const terminal =
      state === "completed" || state === "failed" || state === "canceled";
    try {
      // Only poll when non-terminal AND the server gave us a task id to poll.
      if (!terminal && task.id) {
        task = await pollUntilTerminal(endpoint, task.id, headers);
      }
    } catch {
      // Poll failed (server doesn't support tasks/get, or task errored) — fall
      // back to whatever text the initial response already carried rather than
      // failing the turn. `input_required`/`working` snapshots still have text.
    }
    const replyText = extractText(task);
    return jsonOk({
      ok: true,
      agent_id,
      endpoint,
      kind: "task",
      state: task.status?.state,
      task_id: task.id,
      reply_text: replyText || `(no text; task state: ${task.status?.state ?? "unknown"})`,
      context_id:
        (task as unknown as { contextId?: string }).contextId ?? context_id,
      raw: { ...raw, result: task },
    });
  }

  // Lenient fallback: some live A2A servers don't tag the result with
  // `kind`. They return the reply wrapped as `result.message` (e.g. protobuf
  // ROLE_AGENT style), or put `parts` directly on the result. Extract text
  // from whichever shape we find rather than failing the whole turn.
  const wrappedMsg = (result as { message?: { parts?: A2AMessagePart[]; contextId?: string } })
    ?.message;
  const looseParts =
    wrappedMsg?.parts ?? (result as { parts?: A2AMessagePart[] })?.parts;
  const looseText = textFromParts(looseParts);
  if (looseText) {
    return jsonOk({
      ok: true,
      agent_id,
      endpoint,
      kind: "message",
      reply_text: looseText,
      context_id:
        wrappedMsg?.contextId ??
        (result as { contextId?: string })?.contextId ??
        context_id,
      raw,
    });
  }

  return jsonOk(
    { ok: false, agent_id, endpoint, error: "reply was neither a message nor a task", raw },
    502,
  );
}

export function OPTIONS() {
  return corsPreflight();
}
