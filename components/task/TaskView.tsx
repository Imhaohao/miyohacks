"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { TaskHeader } from "./TaskHeader";
import { ContextEnrichmentPanel } from "./ContextEnrichmentPanel";
import { BidWindow } from "./BidWindow";
import { AuctionResolution } from "./AuctionResolution";
import { ValueImpactPanel } from "./ValueImpactPanel";
import { ExecutionPanel } from "./ExecutionPanel";
import { JudgeVerdictPanel } from "./JudgeVerdictPanel";
import { SettlementPanel } from "./SettlementPanel";
import { PlanPanel } from "./PlanPanel";
import { ConversionDropDemo } from "./ConversionDropDemo";
import { isConversionDropPrompt } from "@/lib/conversion-drop-demo";
import { useStickToLatest } from "@/lib/use-stick-to-latest";
import { ArrowDown } from "@phosphor-icons/react";
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
    return <TaskLoading />;
  }
  if (task === null) {
    return (
      <Card className="border-rose-200 bg-rose-50/40">
        <p className="text-sm text-rose-700">Task not found.</p>
      </Card>
    );
  }

  // Prompts mentioning "conversion drop" route to the dedicated
  // diagnose-then-PR investigation view instead of the generic auction view.
  const isConversionDemo = isConversionDropPrompt(task.prompt);

  // Multi-step parent: show the plan + a final synthesis section. Sub-step
  // auctions/bids live on the child task pages (linked from PlanPanel).
  const isMultiStepParent =
    Array.isArray(task.task_plan) && task.task_plan.length >= 2;

  if (isConversionDemo) {
    return (
      <div className="space-y-4">
        <TaskHeader task={task} />
        <ConversionDropDemo task={task} events={lifecycle} />
      </div>
    );
  }

  return (
    <RegularTaskView
      task={task}
      escrow={escrow}
      lifecycle={lifecycle}
      taskId={taskId}
      isMultiStepParent={isMultiStepParent}
    />
  );
}

function RegularTaskView({
  task,
  escrow,
  lifecycle,
  taskId,
  isMultiStepParent,
}: {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
  lifecycle: LifecycleEventDoc[];
  taskId: string;
  isMultiStepParent: boolean;
}) {
  const { sentinelRef, hasNewBelow, scrollToLatest } = useStickToLatest(
    lifecycle.length,
  );

  return (
    <div className="space-y-4">
      <TaskHeader task={task} />
      <ContextEnrichmentPanel events={lifecycle} taskId={taskId} />
      {isMultiStepParent ? (
        <>
          <PlanPanel task={task} />
          <ExecutionPanel task={task} events={lifecycle} />
          <JudgeVerdictPanel task={task} events={lifecycle} />
        </>
      ) : (
        <>
          <BidWindow task={task} events={lifecycle} />
          <AuctionResolution events={lifecycle} />
          <ValueImpactPanel task={task} events={lifecycle} />
          <ExecutionPanel task={task} events={lifecycle} />
          <JudgeVerdictPanel task={task} events={lifecycle} />
          <SettlementPanel
            task={task}
            escrow={escrow ?? null}
            events={lifecycle}
          />
        </>
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {hasNewBelow && (
        <button
          type="button"
          onClick={scrollToLatest}
          className="fixed bottom-6 left-1/2 z-30 inline-flex -translate-x-1/2 animate-fade-up items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-ink/90"
        >
          <ArrowDown size={14} weight="bold" />
          See latest
        </button>
      )}
    </div>
  );
}

function TaskLoading() {
  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <div className="space-y-3">
          <div className="shimmer h-4 w-32 rounded" />
          <div className="shimmer h-5 w-3/4 rounded" />
          <div className="shimmer h-5 w-2/3 rounded" />
        </div>
      </Card>
      <Card>
        <div className="space-y-3">
          <div className="shimmer h-4 w-24 rounded" />
          <div className="shimmer h-20 w-full rounded" />
        </div>
      </Card>
    </div>
  );
}
