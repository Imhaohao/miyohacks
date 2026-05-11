"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type { ExecutionPlanDoc, LifecycleEventDoc, TaskDoc } from "@/lib/task-view";

export function PlanReviewPanel({
  task,
  events,
}: {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}) {
  const plan = useQuery(api.executionPlans.forTask, {
    task_id: task._id as Id<"tasks">,
  }) as ExecutionPlanDoc | null | undefined;
  const approve = useMutation(api.executionPlans.approve);
  const requestRevision = useMutation(api.executionPlans.requestRevision);
  const cancel = useMutation(api.executionPlans.cancel);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const started = events.find(
    (event) => event.event_type === "execution_plan_started",
  );
  const ready = events.find((event) => event.event_type === "execution_plan_ready");
  const elapsed = useElapsedSeconds(started && !ready ? started.timestamp : undefined);

  if (!started && !plan) return null;

  if (plan === undefined || !plan) {
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="Execution plan"
          meta={<Pill tone="info" pulse>Drafting</Pill>}
        />
        <LoadingProgress
          label="Winner is drafting the plan"
          status="No external work starts until the buyer approves this execution plan."
          details={[
            "The plan names deliverables, context requirements, risks, and acceptance criteria.",
            "Approval releases the winning specialist into execution.",
          ]}
          elapsedSeconds={elapsed}
          tone="brand"
        />
      </Card>
    );
  }

  const artifact = plan.plan;
  const canAct = task.status === "plan_review" && plan.status === "pending";

  async function run(name: string, action: () => Promise<unknown>) {
    setBusy(name);
    try {
      await action();
      if (name === "revise") setFeedback("");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Execution plan"
        meta={
          <span className="inline-flex items-center gap-2">
            <Pill tone={plan.status === "approved" ? "success" : "warning"}>
              {plan.status.replace("_", " ")}
            </Pill>
            <span className="font-mono">{plan.agent_id}</span>
          </span>
        }
      />

      <div className="rounded-2xl bg-brand-50 p-4">
        <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
          {artifact.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {artifact.summary}
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Section title="Deliverables">
          {artifact.deliverables.map((item) => (
            <li key={`${item.title}-${item.artifact_type}`}>
              <span className="font-medium text-ink">{item.title}</span>
              <span className="block text-ink-muted">{item.description}</span>
            </li>
          ))}
        </Section>
        <Section title="Acceptance criteria">
          {artifact.acceptance_criteria.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </Section>
        <Section title="Context required">
          {artifact.context_required.map((item) => (
            <li key={`${item.owner}-${item.item}`}>
              <span className="font-mono text-[11px] text-brand-700">
                {item.owner}
              </span>
              <span className="block text-ink">{item.item}</span>
              <span className="block text-ink-muted">{item.why}</span>
            </li>
          ))}
        </Section>
        <Section title="Risks">
          {artifact.risks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </Section>
      </div>

      {canAct ? (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <p className="text-sm text-ink-muted">{artifact.approval_prompt}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                run("approve", () =>
                  approve({ task_id: task._id as Id<"tasks">, actor: "buyer:web" }),
                )
              }
            >
              {busy === "approve" ? "Approving..." : "Approve execution"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busy) || feedback.trim().length === 0}
              onClick={() =>
                run("revise", () =>
                  requestRevision({
                    task_id: task._id as Id<"tasks">,
                    actor: "buyer:web",
                    feedback,
                  }),
                )
              }
            >
              {busy === "revise" ? "Sending..." : "Request revision"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() =>
                run("cancel", () =>
                  cancel({
                    task_id: task._id as Id<"tasks">,
                    actor: "buyer:web",
                    reason: "Buyer cancelled before execution approval.",
                  }),
                )
              }
            >
              Cancel
            </Button>
          </div>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={3}
            placeholder="Revision feedback for the winning agent..."
            className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:outline-none focus:shadow-ring"
          />
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-surface-subtle px-3 py-2 text-sm text-ink-muted">
          {plan.status === "approved"
            ? "Approved. The specialist can now execute."
            : plan.status === "cancelled"
              ? "Cancelled before execution. Escrow was refunded."
              : "Revision requested. A new plan will appear here."}
        </p>
      )}
    </Card>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">
        {title}
      </h4>
      <ul className="space-y-2 text-sm leading-relaxed text-ink-muted">
        {children}
      </ul>
    </div>
  );
}
