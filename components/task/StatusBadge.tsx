import { Pill, type PillTone } from "@/components/ui/Pill";
import type { TaskStatus } from "@/lib/types";

const META: Record<string, { label: string; tone: PillTone; pulse?: boolean }> = {
  open: { label: "Open", tone: "neutral" },
  planning: { label: "Planning", tone: "info", pulse: true },
  shortlisting: { label: "Shortlisting", tone: "info", pulse: true },
  bidding: { label: "Bidding", tone: "warning", pulse: true },
  awarded: { label: "Awarded", tone: "info" },
  plan_review: { label: "Plan Review", tone: "warning", pulse: true },
  approved: { label: "Approved", tone: "success" },
  executing: { label: "Executing", tone: "brand", pulse: true },
  judging: { label: "Judging", tone: "info", pulse: true },
  synthesizing: { label: "Synthesizing", tone: "brand", pulse: true },
  complete: { label: "Complete", tone: "success" },
  disputed: { label: "Disputed", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const FALLBACK = { label: "Unknown", tone: "neutral" as PillTone, pulse: false };

export function StatusBadge({ status }: { status: TaskStatus | string | undefined }) {
  // Defensive: status can be undefined briefly during reactive load, or hold
  // a legacy value from a row written before the current union. Render a
  // muted "Unknown" pill instead of crashing the page.
  const m = (status && META[status as TaskStatus]) || {
    ...FALLBACK,
    label: status ? String(status) : FALLBACK.label,
  };
  return (
    <Pill tone={m.tone} pulse={m.pulse}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {m.label}
    </Pill>
  );
}
