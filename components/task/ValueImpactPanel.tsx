"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { formatMoney } from "@/lib/utils";
import type {
  AuctionResolvedPayload,
  LifecycleEventDoc,
  TaskDoc,
} from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

const BASELINE_GENERALIST_SECONDS = 30 * 60;

export function ValueImpactPanel({ task, events }: Props) {
  const resolved = events.find((e) => e.event_type === "auction_resolved");
  if (!resolved || typeof task.price_paid !== "number") return null;

  const payload = resolved.payload as unknown as AuctionResolvedPayload;
  const saved = Math.max(0, task.max_budget - task.price_paid);
  const savingsRate =
    task.max_budget > 0 ? Math.round((saved / task.max_budget) * 100) : 0;
  const estimatedSeconds = Math.max(1, payload.winner.estimated_seconds);
  const efficiencyLift = Math.max(
    0,
    Math.round(
      ((BASELINE_GENERALIST_SECONDS - estimatedSeconds) /
        BASELINE_GENERALIST_SECONDS) *
        100,
    ),
  );

  return (
    <Card className="border-terminal-accent/50 bg-terminal-accent/5">
      <CardHeader>
        <span>Specialist impact</span>
        <span className="text-terminal-accent">ROI estimate</span>
      </CardHeader>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric
          label="You saved"
          value={formatMoney(saved)}
          sub={`${savingsRate}% below max budget`}
        />
        <Metric
          label="Efficiency improved"
          value={`${efficiencyLift}%`}
          sub={`vs. ${Math.round(BASELINE_GENERALIST_SECONDS / 60)} min generalist baseline`}
        />
        <Metric
          label="Specialized agent"
          value={payload.winner.agent_id}
          sub={`estimated ${estimatedSeconds}s to first output`}
        />
      </div>

      <p className="mt-4 text-xs text-terminal-muted">
        You saved {formatMoney(saved)} and improved your efficiency by{" "}
        {efficiencyLift}% by using this specialized agent. Savings are computed
        from budget minus second-price payment; efficiency is an estimate from
        the winning specialist&apos;s quoted time.
      </p>
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded border border-terminal-border bg-black/30 p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-terminal-muted">
        {label}
      </div>
      <div className="mt-2 truncate font-mono text-2xl font-semibold text-terminal-text">
        {value}
      </div>
      <div className="mt-1 text-xs text-terminal-muted">{sub}</div>
    </div>
  );
}
