import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { formatMoney } from "@/lib/utils";
import type { TaskDoc } from "@/lib/task-view";

export function TaskHeader({ task }: { task: TaskDoc }) {
  const isAgent = task.posted_by.startsWith("agent:");
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-terminal-muted">
            <span
              className={`rounded px-1.5 py-0.5 font-mono ${
                isAgent
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-terminal-border text-terminal-muted"
              }`}
            >
              {isAgent ? "agent" : "human"}
            </span>
            <span>brand · {task.posted_by}</span>
            <span>· workflow · {task.task_type}</span>
          </div>
          <p className="text-sm text-terminal-text">{task.prompt}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={task.status} />
          <div className="text-right text-xs">
            <div className="text-terminal-muted">campaign budget</div>
            <div className="font-mono text-terminal-text">
              {formatMoney(task.max_budget)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
