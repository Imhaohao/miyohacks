import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatMoney, cn } from "@/lib/utils";
import type {
  EscrowDoc,
  LifecycleEventDoc,
  SettledPayload,
  TaskDoc,
} from "@/lib/task-view";
import { ArrowRight, ArrowLeft } from "@phosphor-icons/react/dist/ssr";

interface Props {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
  events: LifecycleEventDoc[];
}

export function SettlementPanel({ task, escrow, events }: Props) {
  const settled = events.find((e) => e.event_type === "settled");
  if (!settled) return null;

  const payload = settled.payload as unknown as SettledPayload;
  const released = payload.escrow === "released";

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Settlement"
        meta={
          <Pill tone={released ? "success" : "danger"}>
            {released ? "Released" : "Refunded"}
          </Pill>
        }
      />

      <div className="mb-5 grid grid-cols-3 items-center gap-3 text-center text-sm">
        <Stop label="Buyer" sub={escrow?.buyer_id ?? "—"} />
        <Arrow
          amount={
            payload.price_paid ?? task.price_paid ?? escrow?.locked_amount ?? 0
          }
          direction={released ? "forward" : "backward"}
        />
        <Stop
          label={released ? "Seller" : "Buyer (refund)"}
          sub={released ? payload.seller_id : escrow?.buyer_id ?? "—"}
          highlight={released}
        />
      </div>

      <div className="rounded-xl bg-surface-subtle p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-ink-muted">Reputation update</div>
            <div className="font-mono text-sm text-ink">
              {payload.seller_id}
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span
              className={cn(
                "animate-value-pop text-lg font-semibold tracking-tight",
                payload.delta >= 0 ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {payload.delta >= 0 ? "+" : ""}
              {payload.delta.toFixed(3)}
            </span>
            <span className="text-ink-subtle">→</span>
            <span className="text-ink">{payload.new_score.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stop({
  label,
  sub,
  highlight = false,
}: {
  label: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-3 text-left",
        highlight ? "bg-brand-50" : "bg-surface-subtle",
      )}
    >
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-0.5 truncate font-mono text-sm text-ink">{sub}</div>
    </div>
  );
}

function Arrow({
  amount,
  direction,
}: {
  amount: number;
  direction: "forward" | "backward";
}) {
  return (
    <div className="flex flex-col items-center justify-center text-xs text-ink-muted">
      <div className="font-mono text-sm text-ink">{formatMoney(amount)}</div>
      <div className="my-1 text-brand-600">
        {direction === "forward" ? (
          <ArrowRight size={20} weight="bold" />
        ) : (
          <ArrowLeft size={20} weight="bold" />
        )}
      </div>
      <div className="text-xs text-ink-muted">
        {direction === "forward" ? "Released" : "Refunded"}
      </div>
    </div>
  );
}
