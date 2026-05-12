import { NextRequest } from "next/server";
import { handlePostTask, type PostTaskArgs } from "@/lib/mcp-tools";
import { resolveApiIdentity } from "@/lib/api-identity";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Partial<PostTaskArgs>;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return jsonError("prompt (string) is required", 400);
  }
  if (typeof body.max_budget !== "number") {
    return jsonError("max_budget (number) is required", 400);
  }
  try {
    const identity = await resolveApiIdentity(req);
    if (!identity && process.env.ALLOW_LEGACY_AGENT_IDS !== "true") {
      return jsonError("unauthorized", 401);
    }
    const result = await handlePostTask(body as PostTaskArgs, identity);
    return jsonOk(result, 201);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
