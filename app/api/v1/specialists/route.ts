import { NextRequest } from "next/server";
import { handleListSpecialists } from "@/lib/mcp-tools";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";
import type { AgentExecutionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const task_type = url.searchParams.get("task_type") ?? undefined;
  try {
    const result = await handleListSpecialists({ task_type });
    const execution_status_counts: Record<AgentExecutionStatus, number> = {
      native_mcp: 0,
      native_a2a: 0,
      arbor_real_adapter: 0,
      needs_vendor_a2a_endpoint: 0,
      mock_unconnected: 0,
    };
    for (const specialist of result) {
      execution_status_counts[specialist.execution_status as AgentExecutionStatus] += 1;
    }
    return jsonOk({ specialists: result, execution_status_counts });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
