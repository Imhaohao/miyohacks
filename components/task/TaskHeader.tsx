import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatusBadge } from "./StatusBadge";
import { formatMoney } from "@/lib/utils";
import type { TaskDoc } from "@/lib/task-view";

export function TaskHeader({ task }: { task: TaskDoc }) {
  const isAgent = task.posted_by.startsWith("agent:");
  return (
    <Card className="animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Pill tone={isAgent ? "info" : "neutral"}>
              {isAgent ? "Agent" : "Human"}
            </Pill>
            <span className="font-mono">{task.posted_by}</span>
            <span className="text-ink-faint">·</span>
            <span>{task.task_type}</span>
          </div>
          <p className="text-base leading-relaxed text-ink">{task.prompt}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <StatusBadge status={task.status} />
          <div className="text-right">
            <div className="text-xs text-ink-muted">Budget</div>
            <div className="font-mono text-lg font-semibold tracking-tight text-ink">
              {formatMoney(task.max_budget)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
