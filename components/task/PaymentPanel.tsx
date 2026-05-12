"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatCredits } from "@/lib/payments";
import type { EscrowDoc, TaskDoc } from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
  ledgerFallback?: Doc<"ledger_entries">[];
  useLiveQueries?: boolean;
}

export function PaymentPanel({
  task,
  escrow,
  ledgerFallback,
  useLiveQueries = true,
}: Props) {
  const liveLedger = useQuery(
    api.payments.ledgerForTask,
    useLiveQueries ? { task_id: task._id as Id<"tasks"> } : "skip",
  ) as Doc<"ledger_entries">[] | undefined;
  const ledger = useLiveQueries ? liveLedger : ledgerFallback;

  const status = task.payment_status ?? "unfunded";
  const tone =
    status === "released"
      ? "success"
      : status === "refunded"
        ? "danger"
        : status === "escrow_locked" || status === "funds_reserved"
          ? "brand"
          : "neutral";

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Payment rail"
        meta={<Pill tone={tone}>{status.replaceAll("_", " ")}</Pill>}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Max budget" value={formatCredits(task.max_budget)} />
        <Metric
          label="Locked escrow"
          value={formatCredits(escrow?.locked_amount ?? task.price_paid ?? 0)}
        />
        <Metric
          label="Platform fee"
          value={formatCredits(escrow?.platform_fee ?? 0)}
        />
        <Metric
          label="Agent net"
          value={formatCredits(escrow?.agent_net_amount ?? 0)}
        />
      </div>
      {ledger && ledger.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          {ledger.slice(-4).map((entry) => (
            <div
              key={entry._id}
              className="grid grid-cols-[1fr_auto] gap-3 border-b border-line bg-white px-3 py-2 text-xs last:border-b-0"
            >
              <div>
                <span className="font-medium text-ink">
                  {entry.entry_type.replaceAll("_", " ")}
                </span>
                <span className="ml-2 font-mono text-ink-muted">
                  {entry.account_type}:{entry.account_id}
                </span>
              </div>
              <span
                className={
                  entry.amount >= 0
                    ? "font-mono text-emerald-600"
                    : "font-mono text-rose-600"
                }
              >
                {entry.amount >= 0 ? "+" : ""}
                {entry.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-subtle p-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}
