import type { TaskStatus, TaskWorkflowMode } from "./types";

export const DEFAULT_TASK_WORKFLOW_MODE: TaskWorkflowMode = "product_demo";

export function normalizeTaskWorkflowMode(
  mode?: string | null,
): TaskWorkflowMode {
  return mode === "protocol_core" ? "protocol_core" : DEFAULT_TASK_WORKFLOW_MODE;
}

export function isProtocolCoreWorkflow(mode?: string | null): boolean {
  return normalizeTaskWorkflowMode(mode) === "protocol_core";
}

export function initialStatusForWorkflow(mode: TaskWorkflowMode): TaskStatus {
  return mode === "protocol_core" ? "bidding" : "planning";
}
