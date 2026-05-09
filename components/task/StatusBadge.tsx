import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

const STYLES: Record<TaskStatus, string> = {
  open: "bg-terminal-border text-terminal-muted",
  bidding: "bg-terminal-warn/20 text-terminal-warn animate-pulse",
  awarded: "bg-blue-500/20 text-blue-400",
  executing: "bg-blue-500/20 text-blue-400 animate-pulse",
  judging: "bg-purple-500/20 text-purple-400 animate-pulse",
  complete: "bg-terminal-accent/20 text-terminal-accent",
  disputed: "bg-terminal-danger/20 text-terminal-danger",
  failed: "bg-terminal-danger/20 text-terminal-danger",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
