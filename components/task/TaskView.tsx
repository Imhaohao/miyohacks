"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TaskHeader } from "./TaskHeader";
import { BidWindow } from "./BidWindow";
import { AuctionResolution } from "./AuctionResolution";
import { ExecutionPanel } from "./ExecutionPanel";
import { JudgeVerdictPanel } from "./JudgeVerdictPanel";
import { SettlementPanel } from "./SettlementPanel";
import type {
  TaskDoc,
  EscrowDoc,
  LifecycleEventDoc,
} from "@/lib/task-view";

export function TaskView({ taskId }: { taskId: string }) {
  const id = taskId as Id<"tasks">;
  const task = useQuery(api.tasks.get, { task_id: id }) as
    | TaskDoc
    | null
    | undefined;
  const escrow = useQuery(api.escrow.forTask, { task_id: id }) as
    | EscrowDoc
    | null
    | undefined;
  const lifecycle = useQuery(api.lifecycle.forTask, { task_id: id }) as
    | LifecycleEventDoc[]
    | undefined;

  if (task === undefined || lifecycle === undefined) {
    return (
      <div className="text-sm text-terminal-muted">loading auction…</div>
    );
  }
  if (task === null) {
    return <div className="text-sm text-terminal-danger">task not found</div>;
  }

  return (
    <div className="space-y-4">
      <TaskHeader task={task} />
      <BidWindow task={task} events={lifecycle} />
      <AuctionResolution events={lifecycle} />
      <ExecutionPanel task={task} events={lifecycle} />
      <JudgeVerdictPanel task={task} />
      <SettlementPanel task={task} escrow={escrow ?? null} events={lifecycle} />
    </div>
  );
}
