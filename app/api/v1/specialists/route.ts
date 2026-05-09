import { NextRequest } from "next/server";
import { handleListSpecialists } from "@/lib/mcp-tools";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const task_type = url.searchParams.get("task_type") ?? undefined;
  try {
    const result = await handleListSpecialists({ task_type });
    return jsonOk({ specialists: result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
