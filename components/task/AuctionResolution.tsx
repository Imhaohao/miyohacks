"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { formatMoney, formatScore, cn } from "@/lib/utils";
import { Trophy, ArrowRight } from "@phosphor-icons/react";
import type {
  AuctionResolvedPayload,
  LifecycleEventDoc,
} from "@/lib/task-view";

interface Props {
  events: LifecycleEventDoc[];
}

export function AuctionResolution({ events }: Props) {
  const resolved = events.find((e) => e.event_type === "auction_resolved");
  const failed = events.find((e) => e.event_type === "auction_failed");

  if (failed) {
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="No specialist matched"
          meta={<span className="text-rose-700">Failed</span>}
        />
        <p className="text-sm text-ink-muted">
          No specialist bid under your budget. Nothing was charged.
        </p>
      </Card>
    );
  }

  if (!resolved) {
    return (
      <Card className="animate-fade-up">
        <CardHeader title="Selecting your specialist" meta="In progress" />
        <p className="text-sm text-ink-muted">
          Specialists are responding privately. Their offers and the picking
          rationale appear here once the window closes.
        </p>
      </Card>
    );
  }

  const payload = resolved.payload as unknown as AuctionResolvedPayload;
  const { bids, winner, vickrey } = payload;
  const isDegenerate = vickrey.rule === "degenerate_single_bid";
  const maxScore = Math.max(...bids.map((b) => b.score), 0.01);

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Specialist selected"
        meta={
          <span className="inline-flex items-center gap-1.5 text-brand-700">
            <Trophy size={12} weight="fill" />
            <span className="font-mono">{winner.agent_id}</span>
          </span>
        }
      />

      <div className="mb-6 rounded-2xl bg-brand-50 p-5">
        <div className="text-xs font-medium text-brand-700">
          Honest pricing · Vickrey second-price
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <span className="text-sm text-ink-muted">
            <span className="font-mono">{winner.agent_id}</span> bid
          </span>
          <span className="text-2xl text-ink-subtle line-through decoration-rose-400 decoration-2">
            {formatMoney(vickrey.winner_bid_price)}
          </span>
          <ArrowRight size={18} weight="bold" className="text-ink-subtle" />
          <span className="animate-value-pop font-display text-3xl font-semibold tracking-tight text-brand-700 sm:text-4xl">
            pays {formatMoney(vickrey.price_paid)}
          </span>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {isDegenerate
            ? "Only one valid offer — they pay their own price."
            : "They pay the runner-up's price, so the honest move is to quote your true cost."}
        </p>
      </div>

      {/* Bid ladder — winner is emphasized; everyone else gets a score bar viz */}
      <div className="space-y-2">
        {bids.map((b, i) => {
          const isWinner = i === 0;
          const widthPct = Math.max(8, Math.round((b.score / maxScore) * 100));
          return (
            <div
              key={b.bid_id}
              className={cn(
                "rounded-xl p-3 text-sm",
                isWinner
                  ? "bg-brand-50"
                  : "bg-surface-subtle",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold tracking-tight",
                    isWinner
                      ? "bg-brand-600 text-white"
                      : "bg-surface-muted text-ink-muted",
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-ink">
                      {b.agent_id}
                    </span>
                    {isWinner && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold tracking-tight text-white">
                        <Trophy size={9} weight="fill" />
                        Winner
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-xs leading-relaxed",
                      isWinner ? "text-ink-soft" : "text-ink-muted",
                    )}
                  >
                    {b.capability_claim}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="score-bar flex-1">
                      <span style={{ width: `${widthPct}%` }} />
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-ink-muted">
                      score {formatScore(b.score)}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-ink-subtle">Bid</div>
                  <div className="font-mono text-sm text-ink">
                    {formatMoney(b.bid_price)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
