import { NextRequest } from "next/server";
import {
  handleScratchpadRead,
  handleScratchpadWrite,
  type ScratchpadWriteArgs,
} from "@/lib/mcp-tools";
import { corsPreflight, jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ dagId: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { dagId } = await ctx.params;
  if (!dagId) return jsonError("dag id is required", 400);
  try {
    return jsonOk(await handleScratchpadRead({ dag_id: dagId }));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { dagId } = await ctx.params;
  if (!dagId) return jsonError("dag id is required", 400);

  // v1 scratchpad writes are anonymous, matching the rest of /api/v1. A bad
  // actor can pollute a DAG; later auth should bind writers to won node tasks.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (!isRecord(body)) return jsonError("JSON body must be an object", 400);
  if (typeof body.agent_id !== "string" || !body.agent_id.trim()) {
    return jsonError("agent_id (string) is required", 400);
  }
  if (typeof body.kind !== "string" || !body.kind.trim()) {
    return jsonError("kind (string) is required", 400);
  }
  if (typeof body.content !== "string" || !body.content.trim()) {
    return jsonError("content (string) is required", 400);
  }
  if (typeof body.confidence !== "number" || !Number.isFinite(body.confidence)) {
    return jsonError("confidence (number) is required", 400);
  }

  const args: ScratchpadWriteArgs = {
    dag_id: dagId,
    agent_id: body.agent_id,
    kind: body.kind as ScratchpadWriteArgs["kind"],
    content: body.content,
    confidence: body.confidence,
  };
  if (typeof body.node_id === "string") args.node_id = body.node_id;
  if (typeof body.task_id === "string") args.task_id = body.task_id;

  try {
    return jsonOk(await handleScratchpadWrite(args), 201);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
