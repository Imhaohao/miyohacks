import { NextRequest } from "next/server";
import { handleGetTask, handleRaiseDispute } from "@/lib/mcp-tools";
import { resolveApiIdentity } from "@/lib/api-identity";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) return jsonError("task id is required", 400);
  let body: { reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return jsonError("reason (string) is required", 400);
  }
  try {
    const identity = await resolveApiIdentity(req);
    if (!identity && process.env.ALLOW_LEGACY_AGENT_IDS !== "true") {
      return jsonError("unauthorized", 401);
    }
    await handleGetTask({ task_id: id }, identity);
    const result = await handleRaiseDispute({ task_id: id, reason: body.reason });
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
