"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { TaskHeader } from "./TaskHeader";
import { PaymentPanel } from "./PaymentPanel";
import { ContextEnrichmentPanel } from "./ContextEnrichmentPanel";
import { BidWindow } from "./BidWindow";
import { ShortlistPanel } from "./ShortlistPanel";
import { AuctionResolution } from "./AuctionResolution";
import { PlanReviewPanel } from "./PlanReviewPanel";
import { ValueImpactPanel } from "./ValueImpactPanel";
import { CampaignEvidencePanel } from "./CampaignEvidencePanel";
import { isCreatorCommerceTask } from "@/lib/campaign-context";
import { ExecutionPanel } from "./ExecutionPanel";
import { JudgeVerdictPanel } from "./JudgeVerdictPanel";
import { SettlementPanel } from "./SettlementPanel";
import { PlanPanel } from "./PlanPanel";
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

  // Multi-step parent: show the plan + a final synthesis section. Sub-step
  // auctions/bids live on the child task pages (linked from PlanPanel).
  const isMultiStepParent =
    Array.isArray(task.task_plan) && task.task_plan.length >= 2;

  return (
    <div className="space-y-4">
      <TaskHeader task={task} />
      <PaymentPanel task={task} escrow={escrow ?? null} />
      <ContextEnrichmentPanel events={lifecycle} />
      {isCreatorCommerceTask(task.prompt, task.task_type) && (
        <CampaignEvidencePanel />
      )}
      {isMultiStepParent ? (
        <>
          <PlanPanel task={task} />
          <ExecutionPanel task={task} events={lifecycle} />
          <JudgeVerdictPanel task={task} events={lifecycle} />
        </>
      ) : (
        <>
          <ShortlistPanel task={task} events={lifecycle} />
          <BidWindow task={task} events={lifecycle} />
          <AuctionResolution task={task} events={lifecycle} />
          <ValueImpactPanel task={task} events={lifecycle} />
          <PlanReviewPanel task={task} events={lifecycle} />
          <ExecutionPanel task={task} events={lifecycle} />
          <JudgeVerdictPanel task={task} events={lifecycle} />
          <SettlementPanel
            task={task}
            escrow={escrow ?? null}
            events={lifecycle}
          />
        </>
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
