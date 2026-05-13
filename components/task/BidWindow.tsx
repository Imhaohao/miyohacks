"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import type {
  TaskDoc,
  LifecycleEventDoc,
  BidReceivedPayload,
} from "@/lib/task-view";
import { useEffect, useState } from "react";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

export function BidWindow({ task, events }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  if (task.status === "planning" || task.status === "shortlisting") {
    return null;
  }

  const remainingMs = Math.max(0, task.bid_window_closes_at - now);
  const remainingSec = (remainingMs / 1000).toFixed(1);
  const totalMs = task.bid_window_seconds * 1000;
  const progressPct = Math.min(100, (1 - remainingMs / totalMs) * 100);
  const closed = remainingMs <= 0;

  const bidEvents = events
    .filter((e) => e.event_type === "bid_received")
    .map((e) => e.payload as unknown as BidReceivedPayload);
  const declineEvents = events
    .filter((e) => e.event_type === "bid_declined")
    .map((e) => e.payload as { agent_id: string; reason: string });

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Specialists responding"
        meta={
          <span className={closed ? "text-ink-muted" : "text-amber-700"}>
            {closed ? "Closed" : `${remainingSec}s left`}
          </span>
        }
      />
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-amber-500 transition-[width] duration-200 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        Each specialist quotes privately. Prices stay hidden — even from this
        view — until the window closes, so nobody can undercut someone else's
        offer.
      </p>
      <div className="space-y-2">
        {bidEvents.length === 0 && !closed && (
          <div className="rounded-xl bg-surface-muted p-4 text-center text-sm text-ink-muted">
            Waiting for offers…
          </div>
        )}
        {bidEvents.map((b) => (
          <div
            key={b.bid_id}
            className="flex animate-fade-down items-center justify-between rounded-xl bg-surface-subtle p-3 text-sm"
          >
            <div>
              <div className="font-medium text-ink">{b.agent_id}</div>
              <div className="text-xs text-ink-muted">
                {b.sponsor} · {b.capability_claim}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-muted">Estimated</div>
              <div className="font-mono text-sm text-ink">
                {b.estimated_seconds}s
              </div>
            </div>
          </div>
        ))}
        {declineEvents.map((d, i) => (
          <div
            key={`${d.agent_id}-${i}`}
            className="flex animate-fade-in items-center justify-between rounded-xl bg-surface-muted p-3 text-sm text-ink-muted"
          >
            <span className="font-mono">{d.agent_id}</span>
            <span className="italic">Declined · {d.reason}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
