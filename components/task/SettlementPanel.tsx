import { Card, CardHeader } from "@/components/ui/Card";
import { formatMoney, cn } from "@/lib/utils";
import type {
  EscrowDoc,
  LifecycleEventDoc,
  SettledPayload,
  TaskDoc,
} from "@/lib/task-view";

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
    <Card>
      <CardHeader>
        <span>Settlement</span>
        <span
          className={cn(
            "rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            released
              ? "bg-terminal-accent/20 text-terminal-accent"
              : "bg-terminal-danger/20 text-terminal-danger",
          )}
        >
          {payload.escrow}
        </span>
      </CardHeader>

      {/* Escrow flow */}
      <div className="mb-5 grid grid-cols-3 items-center gap-2 text-center text-xs">
        <Stop label="buyer" sub={escrow?.buyer_id ?? "—"} />
        <Arrow
          amount={payload.price_paid ?? task.price_paid ?? escrow?.locked_amount ?? 0}
          direction={released ? "forward" : "backward"}
        />
        <Stop
          label={released ? "seller" : "buyer (refund)"}
          sub={released ? payload.seller_id : escrow?.buyer_id ?? "—"}
          highlight={released}
        />
      </div>

      {/* Reputation delta */}
      <div className="rounded border border-terminal-border bg-black/30 p-3">
        <div className="flex items-center justify-between text-xs">
          <div>
            <div className="text-terminal-muted">reputation update</div>
            <div className="font-mono text-terminal-text">
              {payload.seller_id}
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span
              className={cn(
                "animate-pulse-once text-lg font-semibold",
                payload.delta >= 0
                  ? "text-terminal-accent"
                  : "text-terminal-danger",
              )}
            >
              {payload.delta >= 0 ? "+" : ""}
              {payload.delta.toFixed(3)}
            </span>
            <span className="text-terminal-muted">→</span>
            <span className="text-terminal-text">
              {payload.new_score.toFixed(2)}
            </span>
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
        "rounded border p-2",
        highlight
          ? "border-terminal-accent/50 bg-terminal-accent/10"
          : "border-terminal-border bg-black/30",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-terminal-muted">
        {label}
      </div>
      <div className="truncate font-mono text-xs text-terminal-text">{sub}</div>
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
    <div className="flex flex-col items-center justify-center text-xs text-terminal-muted">
      <div className="font-mono text-terminal-text">{formatMoney(amount)}</div>
      <div className="my-1 text-2xl leading-none text-terminal-accent">
        {direction === "forward" ? "→" : "←"}
      </div>
      <div className="text-[10px] uppercase tracking-wider">
        {direction === "forward" ? "released" : "refunded"}
      </div>
    </div>
  );
}
