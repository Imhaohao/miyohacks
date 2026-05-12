"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type { TaskDoc, LifecycleEventDoc } from "@/lib/task-view";
import { cn } from "@/lib/utils";

interface Props {
  task: TaskDoc;
  events?: LifecycleEventDoc[];
}

export function JudgeVerdictPanel({ task, events = [] }: Props) {
  const verdict = task.judge_verdict;
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Judging starts when execution_complete fires; ends when the verdict lands.
  const judgingStarted = events.find(
    (e) => e.event_type === "execution_complete",
  );
  const verdictLanded = events.find((e) => e.event_type === "judge_verdict");
  const elapsed = useElapsedSeconds(
    judgingStarted && !verdictLanded ? judgingStarted.timestamp : undefined,
  );

  // Show the live "judging" spinner once execution is done but no verdict yet.
  if (!verdict) {
    if (!judgingStarted) return null;
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="Judge verdict"
          meta={<Pill tone="info" pulse>Reviewing</Pill>}
        />
        <LoadingProgress
          label="Judge is reviewing the output"
          status="Independent gpt-5.5 call: scores the work against the enriched context, returns accept/reject + a quality score 0–1."
          details={[
            "Strict but fair: rejects if off-topic, hallucinated, or fails the spec.",
            "Reputation flows from this score: accepted bumps rep, rejected docks it.",
          ]}
          elapsedSeconds={elapsed}
          tone="info"
        />
      </Card>
    );
  }

  const accepted = verdict.verdict === "accept";
  const pct = Math.round(verdict.quality_score * 100);
  const wasOverridden = Boolean((verdict as { override?: boolean }).override);

  async function overrideJudge(nextVerdict: "accept" | "reject") {
    const trimmed = reason.trim();
    if (!trimmed) {
      setMessage("Add a short reason before overriding the judge.");
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/tasks/${task._id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdict: nextVerdict,
          reason: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Override failed");
      }
      setMessage(`Override saved: ${nextVerdict}.`);
      setReason("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Override failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Judge verdict"
        meta={
          <Pill tone={accepted ? "success" : "danger"}>
            {wasOverridden ? "Overridden" : accepted ? "Accepted" : "Rejected"}
          </Pill>
        }
      />
      <p className="mb-5 text-sm leading-relaxed text-ink-soft">
        {verdict.reasoning}
      </p>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-ink-muted">Quality score</span>
          <span className="font-mono text-ink">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out",
              accepted ? "bg-emerald-500" : "bg-rose-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-surface-subtle p-4">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">
          Human override
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The judge is advisory. A buyer/operator can override it with an
          explicit reason; the override is logged and settlement is updated.
        </p>
        <textarea
          className="mt-3 min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand-400"
          placeholder="Why should the judge decision be overridden?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => overrideJudge("accept")}
          >
            Override to accept
          </button>
          <button
            className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => overrideJudge("reject")}
          >
            Override to reject
          </button>
        </div>
        {message && (
          <p className="mt-3 text-xs text-ink-muted">
            {message}
          </p>
        )}
      </div>
    </Card>
  );
}
