"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type { AgentShortlistDoc, LifecycleEventDoc, TaskDoc } from "@/lib/task-view";
import { formatScore } from "@/lib/utils";

export function ShortlistPanel({
  task,
  events,
}: {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}) {
  const rows = (useQuery(api.agentShortlists.forTask, {
    task_id: task._id as Id<"tasks">,
  }) ?? []) as AgentShortlistDoc[];
  const started = events.find((event) => event.event_type === "shortlist_started");
  const ready = events.find((event) => event.event_type === "shortlist_ready");
  const elapsed = useElapsedSeconds(started && !ready ? started.timestamp : undefined);

  if (!started && rows.length === 0) return null;

  if (rows.length === 0) {
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="Broker shortlisting"
          meta={<Pill tone="info" pulse>Ranking 100 agents</Pill>}
        />
        <LoadingProgress
          label="Matching task to agent contacts"
          status="Scoring industry, capability, protocol, health, auth, and reputation fit."
          details={[
            "The full catalog is broad, but only the best-fit agents are invited to bid.",
            "Unhealthy or unreachable contacts are excluded before the auction opens.",
          ]}
          elapsedSeconds={elapsed}
          tone="brand"
        />
      </Card>
    );
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Broker shortlist"
        meta={<Pill tone="brand">{rows.length} of 100 invited</Pill>}
      />
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row._id}
            className="rounded-xl bg-surface-subtle p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-ink">
                  #{row.rank} {row.agent_id}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Pill tone="neutral">{row.industry}</Pill>
                  <Pill tone={row.protocol === "mcp" || row.protocol === "a2a" ? "info" : "neutral"}>
                    {row.protocol.toUpperCase()}
                  </Pill>
                </div>
              </div>
              <div className="text-right font-mono text-xs text-ink-muted">
                {formatScore(row.score)}
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              {row.reasons.slice(0, 2).join(" · ")}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

