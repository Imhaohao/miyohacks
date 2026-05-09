import { Card, CardHeader } from "@/components/ui/Card";
import type { TaskDoc } from "@/lib/task-view";
import { cn } from "@/lib/utils";

export function JudgeVerdictPanel({ task }: { task: TaskDoc }) {
  const verdict = task.judge_verdict;
  if (!verdict) return null;

  const accepted = verdict.verdict === "accept";
  const pct = Math.round(verdict.quality_score * 100);

  return (
    <Card>
      <CardHeader>
        <span>Judge verdict</span>
        <span
          className={cn(
            "rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            accepted
              ? "bg-terminal-accent/20 text-terminal-accent"
              : "bg-terminal-danger/20 text-terminal-danger",
          )}
        >
          {verdict.verdict}
        </span>
      </CardHeader>
      <p className="mb-4 text-sm text-terminal-text">{verdict.reasoning}</p>
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-terminal-muted">
          <span>quality score</span>
          <span className="font-mono text-terminal-text">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-terminal-border">
          <div
            className={cn(
              "h-full transition-[width] duration-700 ease-out",
              accepted ? "bg-terminal-accent" : "bg-terminal-danger",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Card>
  );
}
