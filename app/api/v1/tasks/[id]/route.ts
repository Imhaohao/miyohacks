import { NextRequest } from "next/server";
import { handleGetTask } from "@/lib/mcp-tools";
import { resolveApiIdentity } from "@/lib/api-identity";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) return jsonError("task id is required", 400);
  try {
    const identity = await resolveApiIdentity(_req);
    if (!identity && process.env.ALLOW_LEGACY_AGENT_IDS !== "true") {
      return jsonError("unauthorized", 401);
    }
    const result = await handleGetTask({ task_id: id }, identity);
    if (!result.task) return jsonError("task not found", 404);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
