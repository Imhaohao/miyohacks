"use client";

import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CheckCircle,
  CircleNotch,
  Circle,
  ArrowRight,
} from "@phosphor-icons/react";
import type { TaskDoc } from "@/lib/task-view";

interface PlanStep {
  prompt: string;
  rationale: string;
  specialist_hint?: string;
}

interface ChildTask {
  _id: string;
  prompt: string;
  status: string;
  step_index?: number;
  parent_task_id?: string;
  result?: { text?: string; agent_id?: string } | unknown;
}

interface Props {
  task: TaskDoc;
}

export function PlanPanel({ task }: Props) {
  const plan = (task.task_plan ?? []) as PlanStep[];
  const children = (useQuery(api.tasks.childrenOf, {
    parent_task_id: task._id as Id<"tasks">,
  }) ?? []) as ChildTask[];

  if (plan.length === 0) return null;

  const childByIndex = new Map<number, ChildTask>();
  for (const c of children) {
    if (typeof c.step_index === "number") {
      childByIndex.set(c.step_index, c);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Plan"
        meta={`${plan.length} steps · ${children.filter((c) => c.status === "complete" || c.status === "disputed").length} done`}
      />
      <p className="mb-4 text-sm text-ink-muted">
        The planner decomposed your goal into sub-tasks. Each one runs its own
        auction with the right specialist; the synthesizer merges the
        deliverables at the end.
      </p>
      <ol className="space-y-2">
        {plan.map((step, i) => {
          const child = childByIndex.get(i);
          const status = child?.status ?? "pending";
          const winnerId =
            child?.result &&
            typeof child.result === "object" &&
            "agent_id" in child.result
              ? (child.result as { agent_id?: string }).agent_id
              : undefined;
          return (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl bg-surface-subtle p-3 text-sm"
            >
              <StepIcon status={status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-[11px] text-ink-subtle">
                    Step {i + 1}
                  </span>
                  {step.specialist_hint && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                      hint · {step.specialist_hint}
                    </span>
                  )}
                  {winnerId && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      delivered by {winnerId}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink">
                  {step.prompt}
                </p>
                {step.rationale && (
                  <p className="mt-1 text-xs text-ink-muted">
                    {step.rationale}
                  </p>
                )}
                {child && (
                  <Link
                    href={`/task/${child._id}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                  >
                    Open sub-task
                    <ArrowRight size={12} weight="bold" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <CheckCircle
        size={20}
        weight="fill"
        className="mt-0.5 shrink-0 text-emerald-500"
      />
    );
  }
  if (status === "disputed" || status === "failed") {
    return (
      <CheckCircle
        size={20}
        weight="fill"
        className="mt-0.5 shrink-0 text-rose-500"
      />
    );
  }
  if (
    status === "bidding" ||
    status === "awarded" ||
    status === "executing" ||
    status === "judging" ||
    status === "synthesizing"
  ) {
    return (
      <CircleNotch
        size={20}
        weight="bold"
        className="mt-0.5 shrink-0 animate-spin text-brand-600"
      />
    );
  }
  return <Circle size={20} className="mt-0.5 shrink-0 text-ink-subtle" />;
}
