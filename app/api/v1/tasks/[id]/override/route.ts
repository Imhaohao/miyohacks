import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { resolveApiIdentity } from "@/lib/api-identity";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";
import { handleGetTask } from "@/lib/mcp-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) return jsonError("task id is required", 400);

  let body: { verdict?: unknown; reason?: unknown; actor?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  if (body.verdict !== "accept" && body.verdict !== "reject") {
    return jsonError("verdict must be 'accept' or 'reject'", 400);
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
    const result = await convex().action(api.disputes.override, {
      task_id: id as Id<"tasks">,
      verdict: body.verdict,
      reason: body.reason,
      actor:
        identity?.agent_id ??
        (typeof body.actor === "string" ? body.actor : "buyer:web"),
    });
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
