"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
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
  AgentShortlistDoc,
  TaskDoc,
  EscrowDoc,
  ExecutionPlanDoc,
  LifecycleEventDoc,
} from "@/lib/task-view";

type ServerTaskBundle = {
  task: TaskDoc | null;
  escrow: EscrowDoc | null;
  lifecycle: LifecycleEventDoc[];
  shortlist?: AgentShortlistDoc[];
  execution_plan?: ExecutionPlanDoc | null;
  payment_ledger?: Array<Record<string, unknown>>;
  children?: TaskDoc[];
};

type WorkflowKey = "context" | "auction" | "plan" | "execution";

type WorkflowSectionMeta = {
  key: WorkflowKey;
  step: number;
  title: string;
  description: string;
};

export function TaskView({ taskId }: { taskId: string }) {
  const id = taskId as Id<"tasks">;
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const signedOut = clerkEnabled && clerkLoaded && !isSignedIn;
  const serverAuthFallback =
    clerkEnabled && clerkLoaded && Boolean(isSignedIn) && !isAuthenticated;
  const waitingForClerk = clerkEnabled && !clerkLoaded;
  const queryArgs =
    signedOut || waitingForClerk || serverAuthFallback ? "skip" : { task_id: id };
  const [serverBundle, setServerBundle] = useState<ServerTaskBundle | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] =
    useState<WorkflowKey>("context");

  const liveTask = useQuery(api.tasks.get, queryArgs) as
    | TaskDoc
    | null
    | undefined;
  const liveEscrow = useQuery(api.escrow.forTask, queryArgs) as
    | EscrowDoc
    | null
    | undefined;
  const liveLifecycle = useQuery(api.lifecycle.forTask, queryArgs) as
    | LifecycleEventDoc[]
    | undefined;

  useEffect(() => {
    if (!serverAuthFallback) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/v1/tasks/${taskId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "Unable to load task");
        }
        if (!cancelled) {
          setServerBundle(json as ServerTaskBundle);
          setServerError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setServerError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void load();
    const interval = window.setInterval(load, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [serverAuthFallback, taskId]);

  const task = serverAuthFallback ? serverBundle?.task : liveTask;
  const escrow = serverAuthFallback ? serverBundle?.escrow : liveEscrow;
  const lifecycle = serverAuthFallback ? serverBundle?.lifecycle : liveLifecycle;
  const isLoadedMultiStepParent = Boolean(
    task && Array.isArray(task.task_plan) && task.task_plan.length >= 2,
  );
  const activeSection = task
    ? activeWorkflowSection(task, lifecycle ?? [], isLoadedMultiStepParent)
    : "context";

  useEffect(() => {
    if (task) setSelectedSection(activeSection);
  }, [activeSection, task?._id]);

  if (signedOut) {
    return <TaskSignInRequired />;
  }
  if (waitingForClerk) {
    return <TaskAuthLoading />;
  }
  if (serverAuthFallback && serverError && !serverBundle) {
    return (
      <Card className="border-rose-200 bg-rose-50/40">
        <p className="text-sm text-rose-700">{serverError}</p>
      </Card>
    );
  }

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
  const isMultiStepParent = isLoadedMultiStepParent;
  const sections = workflowSections(isMultiStepParent);

  return (
    <div className="space-y-4">
      <TaskHeader task={task} />
      <WorkflowStepper
        sections={sections}
        activeKey={activeSection}
        selectedKey={selectedSection}
        task={task}
        events={lifecycle}
        onSelect={setSelectedSection}
      />

      {selectedSection === "context" && (
        <WorkflowSectionBody
          section={sections.find((section) => section.key === "context")}
        >
          <PaymentPanel
            task={task}
            escrow={escrow ?? null}
            ledgerFallback={serverBundle?.payment_ledger as never}
            useLiveQueries={!serverAuthFallback}
          />
          <ContextEnrichmentPanel events={lifecycle} />
          {isCreatorCommerceTask(task.prompt, task.task_type) && (
            <CampaignEvidencePanel />
          )}
        </WorkflowSectionBody>
      )}

      {selectedSection === "auction" && (
        <WorkflowSectionBody
          section={sections.find((section) => section.key === "auction")}
        >
          {isMultiStepParent ? (
            <PlanPanel
              task={task}
              childrenFallback={serverBundle?.children}
              useLiveQueries={!serverAuthFallback}
            />
          ) : (
            <>
              <ShortlistPanel
                task={task}
                events={lifecycle}
                rowsFallback={serverBundle?.shortlist}
                useLiveQueries={!serverAuthFallback}
              />
              <BidWindow task={task} events={lifecycle} />
              <AuctionResolution
                task={task}
                events={lifecycle}
                useLiveQueries={!serverAuthFallback}
              />
              <ValueImpactPanel task={task} events={lifecycle} />
            </>
          )}
        </WorkflowSectionBody>
      )}

      {selectedSection === "plan" && !isMultiStepParent && (
        <WorkflowSectionBody
          section={sections.find((section) => section.key === "plan")}
        >
          <PlanReviewPanel
            task={task}
            events={lifecycle}
            planFallback={serverBundle?.execution_plan ?? null}
            useLiveQueries={!serverAuthFallback}
          />
        </WorkflowSectionBody>
      )}

      {selectedSection === "execution" && (
        <WorkflowSectionBody
          section={sections.find((section) => section.key === "execution")}
        >
          {isMultiStepParent && (
            <>
              <PlanPanel
                task={task}
                childrenFallback={serverBundle?.children}
                useLiveQueries={!serverAuthFallback}
              />
            </>
          )}
          <ExecutionPanel task={task} events={lifecycle} />
          <JudgeVerdictPanel task={task} events={lifecycle} />
          {!isMultiStepParent && (
            <SettlementPanel
              task={task}
              escrow={escrow ?? null}
              events={lifecycle}
            />
          )}
        </WorkflowSectionBody>
      )}
    </div>
  );
}

function workflowSections(isMultiStepParent: boolean): WorkflowSectionMeta[] {
  if (isMultiStepParent) {
    return [
      {
        key: "context",
        step: 1,
        title: "Context",
        description: "Budget, business memory, and repo/source grounding.",
      },
      {
        key: "auction",
        step: 2,
        title: "Task Plan",
        description: "The goal is split into child auctions by specialist.",
      },
      {
        key: "execution",
        step: 3,
        title: "Execute",
        description: "Child work rolls up into the final result and judge.",
      },
    ];
  }

  return [
    {
      key: "context",
      step: 1,
      title: "Context",
      description: "Budget, business memory, and repo/source grounding.",
    },
    {
      key: "auction",
      step: 2,
      title: "Auction",
      description: "Shortlist, sealed bids, top proposals, and selection.",
    },
    {
      key: "plan",
      step: 3,
      title: "Approve",
      description: "Review the selected specialist's execution plan.",
    },
    {
      key: "execution",
      step: 4,
      title: "Deliver",
      description: "Execution, judge verdict, and settlement.",
    },
  ];
}

function activeWorkflowSection(
  task: TaskDoc,
  events: LifecycleEventDoc[],
  isMultiStepParent: boolean,
): WorkflowKey {
  if (
    task.status === "executing" ||
    task.status === "judging" ||
    task.status === "synthesizing" ||
    task.status === "complete" ||
    task.status === "disputed" ||
    task.status === "cancelled"
  ) {
    return "execution";
  }
  if (task.status === "plan_review" || task.status === "approved") {
    return isMultiStepParent ? "execution" : "plan";
  }
  if (
    task.status === "shortlisting" ||
    task.status === "bidding" ||
    task.status === "awarded" ||
    task.status === "failed" ||
    events.some((event) => event.event_type === "shortlist_started")
  ) {
    return "auction";
  }
  return "context";
}

function WorkflowStepper({
  sections,
  activeKey,
  selectedKey,
  task,
  events,
  onSelect,
}: {
  sections: WorkflowSectionMeta[];
  activeKey: WorkflowKey;
  selectedKey: WorkflowKey;
  task: TaskDoc;
  events: LifecycleEventDoc[];
  onSelect: (key: WorkflowKey) => void;
}) {
  return (
    <div className="animate-fade-up">
      <div
        className={cn(
          "grid gap-2",
          sections.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4",
        )}
      >
        {sections.map((section) => {
          const selected = selectedKey === section.key;
          const state = workflowSectionState(section.key, activeKey, task, events);
          return (
            <button
              key={section.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(section.key)}
              className={cn(
                "group flex min-h-[92px] items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                selected
                  ? "border-brand-200 bg-brand-50 text-brand-900"
                  : "border-line bg-white text-ink hover:border-brand-100 hover:bg-surface-subtle",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold",
                  selected
                    ? "bg-brand-600 text-white"
                    : "bg-surface-muted text-ink-muted group-hover:bg-brand-50 group-hover:text-brand-700",
                )}
              >
                {section.step}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {section.title}
                  </span>
                  <Pill tone={state.tone} pulse={state.pulse} className="text-[10px]">
                    {state.icon}
                    {state.label}
                  </Pill>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                  {section.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowSectionBody({
  section,
  children,
}: {
  section?: WorkflowSectionMeta;
  children: ReactNode;
}) {
  if (!section) return null;
  return (
    <section className="animate-fade-up">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-brand-700">
            Step {section.step}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-ink">
            {section.title}
          </h2>
        </div>
        <p className="max-w-md text-right text-xs leading-relaxed text-ink-muted">
          {section.description}
        </p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function workflowSectionState(
  key: WorkflowKey,
  activeKey: WorkflowKey,
  task: TaskDoc,
  events: LifecycleEventDoc[],
): {
  label: string;
  tone: PillTone;
  pulse?: boolean;
  icon: ReactNode;
} {
  const done = isWorkflowSectionDone(key, task, events);
  const failed =
    (task.status === "failed" && (key === activeKey || key === "auction")) ||
    (task.status === "cancelled" && key === "execution") ||
    (task.status === "disputed" && key === "execution");

  if (failed) {
    return {
      label: task.status === "disputed" ? "Disputed" : "Stopped",
      tone: "danger",
      icon: <WarningIcon />,
    };
  }
  if (key === activeKey) {
    return {
      label: "Current",
      tone: "brand",
      pulse: true,
      icon: <CurrentIcon />,
    };
  }
  if (done) {
    return {
      label: "Done",
      tone: "success",
      icon: <DoneIcon />,
    };
  }
  return {
    label: "Waiting",
    tone: "neutral",
    icon: <WaitingIcon />,
  };
}

function isWorkflowSectionDone(
  key: WorkflowKey,
  task: TaskDoc,
  events: LifecycleEventDoc[],
) {
  if (key === "context") {
    return events.some((event) =>
      [
        "context_enriched",
        "product_context_attached",
        "shortlist_started",
        "auction_resolved",
      ].includes(event.event_type),
    );
  }
  if (key === "auction") {
    return Boolean(
      task.winning_bid_id ||
        events.some((event) => event.event_type === "auction_resolved"),
    );
  }
  if (key === "plan") {
    return events.some((event) => event.event_type === "execution_plan_approved");
  }
  return task.status === "complete";
}

function CurrentIcon() {
  return <span className="h-1.5 w-1.5 rounded-full bg-current" />;
}

function DoneIcon() {
  return (
    <svg
      aria-hidden="true"
      width={10}
      height={10}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M6.5 11.6 2.9 8l1-1 2.6 2.6 5.6-5.6 1 1-6.6 6.6Z" />
    </svg>
  );
}

function WaitingIcon() {
  return (
    <svg
      aria-hidden="true"
      width={10}
      height={10}
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      width={10}
      height={10}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M8 1.6 15 14H1L8 1.6Zm-.7 4.6v3.6h1.4V6.2H7.3Zm0 4.8v1.4h1.4V11H7.3Z" />
    </svg>
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

function TaskAuthLoading() {
  return (
    <Card>
      <div className="space-y-3">
        <div className="shimmer h-4 w-40 rounded" />
        <p className="text-sm leading-relaxed text-ink-muted">
          Loading your secure auction workspace.
        </p>
      </div>
    </Card>
  );
}

function TaskSignInRequired() {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <p className="text-sm leading-relaxed text-amber-800">
        Sign in to view this auction workspace.
      </p>
      <div className="mt-4">
        <SignInButton mode="modal">
          <Button type="button">Sign in</Button>
        </SignInButton>
      </div>
    </Card>
  );
}
