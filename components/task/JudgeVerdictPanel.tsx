import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import type { TaskDoc } from "@/lib/task-view";
import { cn } from "@/lib/utils";

export function JudgeVerdictPanel({ task }: { task: TaskDoc }) {
  const verdict = task.judge_verdict;
  if (!verdict) return null;

  const accepted = verdict.verdict === "accept";
  const pct = Math.round(verdict.quality_score * 100);

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Judge verdict"
        meta={
          <Pill tone={accepted ? "success" : "danger"}>
            {accepted ? "Accepted" : "Rejected"}
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
    </Card>
  );
}
