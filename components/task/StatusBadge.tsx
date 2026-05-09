import { Pill, type PillTone } from "@/components/ui/Pill";
import type { TaskStatus } from "@/lib/types";

const META: Record<TaskStatus, { label: string; tone: PillTone; pulse?: boolean }> = {
  open: { label: "Open", tone: "neutral" },
  bidding: { label: "Bidding", tone: "warning", pulse: true },
  awarded: { label: "Awarded", tone: "info" },
  executing: { label: "Executing", tone: "brand", pulse: true },
  judging: { label: "Judging", tone: "info", pulse: true },
  complete: { label: "Complete", tone: "success" },
  disputed: { label: "Disputed", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const m = META[status];
  return (
    <Pill tone={m.tone} pulse={m.pulse}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {m.label}
    </Pill>
  );
}
