import { NextRequest } from "next/server";
import { handleListSpecialists } from "@/lib/mcp-tools";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";
import {
  ROSTER_CLASS_ORDER,
  ROSTER_CLASS_LABELS,
} from "@/lib/specialists/roster";
import {
  currentMockPolicy,
  MOCK_POLICY_DESCRIPTIONS,
  MOCK_POLICY_LABELS,
} from "@/lib/mock-policy";
import type { AgentExecutionStatus, AgentRosterClass } from "@/lib/types";

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
      arbor_sandbox_adapter: 0,
      needs_vendor_a2a_endpoint: 0,
      mock_unconnected: 0,
    };
    for (const specialist of result) {
      execution_status_counts[specialist.execution_status] += 1;
    }
    const roster_class_counts = Object.fromEntries(
      ROSTER_CLASS_ORDER.map((rosterClass) => [rosterClass, 0]),
    ) as Record<AgentRosterClass, number>;
    for (const specialist of result) {
      roster_class_counts[specialist.roster_class] += 1;
    }
    const mockPolicy = currentMockPolicy();
    return jsonOk({
      specialists: result,
      execution_status_counts,
      roster_class_counts,
      roster_class_labels: ROSTER_CLASS_LABELS,
      mock_policy: mockPolicy,
      mock_policy_label: MOCK_POLICY_LABELS[mockPolicy],
      mock_policy_description: MOCK_POLICY_DESCRIPTIONS[mockPolicy],
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
