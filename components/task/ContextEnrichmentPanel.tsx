"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type { LifecycleEventDoc } from "@/lib/task-view";

interface Props {
  events: LifecycleEventDoc[];
}

interface AddedPayload {
  char_count?: number;
  document_count?: number;
  duration_ms: number;
  summary_preview: string;
}

interface SkippedPayload {
  reason: string;
}

/**
 * Pre-bidding enrichment panel. Renders when the orchestration pipeline is
 * waiting on Nia (and, eventually, Hyperspell) to populate the repo /
 * business slots of the task context. Shows a live spinner with elapsed time
 * while waiting; flips to a summary card when Nia returns.
 */
export function ContextEnrichmentPanel({ events }: Props) {
  const hyperspellStarted = events.find(
    (e) => e.event_type === "hyperspell_business_context_started",
  );
  const hyperspellAdded = events.find(
    (e) => e.event_type === "hyperspell_business_context_added",
  );
  const hyperspellSkipped = events.find(
    (e) => e.event_type === "hyperspell_business_context_skipped",
  );
  const niaStarted = events.find((e) => e.event_type === "nia_repo_context_started");
  const niaAdded = events.find((e) => e.event_type === "nia_repo_context_added");
  const niaSkipped = events.find((e) => e.event_type === "nia_repo_context_skipped");
  const started = hyperspellStarted ?? niaStarted;
  const done =
    (hyperspellAdded || hyperspellSkipped || !hyperspellStarted) &&
    (niaAdded || niaSkipped || !niaStarted);

  // Hook MUST be called unconditionally; pass undefined to freeze the ticker.
  const elapsed = useElapsedSeconds(
    started && !done ? started.timestamp : undefined,
  );

  // Nothing happened yet (very early load) or this task pre-dates enrichment.
  if (!started && !hyperspellAdded && !hyperspellSkipped && !niaAdded && !niaSkipped) {
    return null;
  }

  if (done) {
    const hyperspell = hyperspellAdded?.payload as unknown as
      | AddedPayload
      | undefined;
    const nia = niaAdded?.payload as unknown as AddedPayload | undefined;
    const skipped =
      ((hyperspellSkipped ?? niaSkipped)?.payload as unknown as
        | SkippedPayload
        | undefined) ?? null;
    return (
      <Card className="animate-fade-up border-sky-200/60 bg-sky-50/30">
        <CardHeader
          title="Context enrichment"
          meta={
            <Pill tone="info">
              Hyperspell + Nia
            </Pill>
          }
        />
        <div className="space-y-3">
          {hyperspell && (
            <ContextBlock
              title={`Hyperspell business memory · ${(hyperspell.duration_ms / 1000).toFixed(1)}s`}
              body={
                hyperspell.summary_preview ||
                `${hyperspell.document_count ?? 0} memory documents matched.`
              }
            />
          )}
          {nia && (
            <ContextBlock
              title={`Nia repo context · ${(nia.duration_ms / 1000).toFixed(1)}s`}
              body={
                nia.summary_preview ||
                `${(nia.char_count ?? 0).toLocaleString()} chars retrieved.`
              }
            />
          )}
          {!hyperspell && !nia && skipped && (
            <p className="text-xs text-ink-muted">{skipped.reason}</p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-up border-sky-200/60 bg-sky-50/30">
      <CardHeader
        title="Context enrichment"
        meta={<Pill tone="info" pulse>Context loading</Pill>}
      />
      <LoadingProgress
        label="Calling Hyperspell and Nia"
        status="Hyperspell searches business memory; Nia retrieves repo/source context."
        details={[
          "Auction won't open until context enrichment returns or times out.",
          "All specialists will see this context packet in their bid prompt.",
        ]}
        elapsedSeconds={elapsed}
        tone="info"
      />
    </Card>
  );
}

function ContextBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink">{title}</p>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/60 p-3 font-sans text-xs text-ink-soft">
        {body}
      </pre>
    </div>
  );
}
