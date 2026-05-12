import { NextRequest } from "next/server";
import {
  runLocalCodex,
  type CodexRunRequest,
} from "@/lib/codex-runner";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function authorize(req: NextRequest) {
  const expected = process.env.CODEX_RUNNER_SECRET;
  if (!expected) {
    throw new Error("CODEX_RUNNER_SECRET is not configured");
  }
  const actual = req.headers.get("authorization");
  if (actual !== `Bearer ${expected}`) {
    throw new Error("unauthorized");
  }
}

export async function POST(req: NextRequest) {
  try {
    authorize(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, message === "unauthorized" ? 401 : 503);
  }

  let body: CodexRunRequest;
  try {
    body = (await req.json()) as CodexRunRequest;
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  if (!body.prompt?.trim()) return jsonError("prompt is required", 400);
  if (!body.agent_id?.trim()) return jsonError("agent_id is required", 400);

  try {
    return jsonOk(await runLocalCodex(body));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}
