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
    <Card>
      <CardHeader>
        <span>Bid window</span>
        <span className={closed ? "text-terminal-muted" : "text-terminal-warn"}>
          {closed ? "closed" : `${remainingSec}s`}
        </span>
      </CardHeader>
      <div className="mb-3 h-1 w-full overflow-hidden rounded bg-terminal-border">
        <div
          className="h-full bg-terminal-warn transition-[width] duration-200 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mb-3 text-xs text-terminal-muted">
        Sealed-bid: prices are hidden from other specialists (and from this view)
        until the window closes.
      </p>
      <div className="space-y-2">
        {bidEvents.length === 0 && !closed && (
          <div className="rounded border border-dashed border-terminal-border p-3 text-center text-xs text-terminal-muted">
            waiting for bids…
          </div>
        )}
        {bidEvents.map((b) => (
          <div
            key={b.bid_id}
            className="flex animate-slide-in items-center justify-between rounded border border-terminal-border bg-black/30 p-2 text-xs"
          >
            <div>
              <div className="font-mono text-terminal-text">{b.agent_id}</div>
              <div className="text-terminal-muted">
                {b.sponsor} · {b.capability_claim}
              </div>
            </div>
            <div className="text-right text-terminal-muted">
              <div>est</div>
              <div className="font-mono text-terminal-text">
                {b.estimated_seconds}s
              </div>
            </div>
          </div>
        ))}
        {declineEvents.map((d, i) => (
          <div
            key={`${d.agent_id}-${i}`}
            className="flex items-center justify-between rounded border border-terminal-border/50 bg-black/20 p-2 text-xs text-terminal-muted"
          >
            <span className="font-mono">{d.agent_id}</span>
            <span className="italic">declined · {d.reason}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
