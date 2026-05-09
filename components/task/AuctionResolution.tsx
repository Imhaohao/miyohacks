"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { formatMoney, formatScore, cn } from "@/lib/utils";
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
      <Card>
        <CardHeader>
          <span>Auction</span>
          <span className="text-terminal-danger">failed</span>
        </CardHeader>
        <p className="text-sm text-terminal-muted">
          No valid bids under budget. Nothing was charged.
        </p>
      </Card>
    );
  }

  if (!resolved) {
    return (
      <Card>
        <CardHeader>
          <span>Auction resolution</span>
          <span>pending</span>
        </CardHeader>
        <p className="text-xs text-terminal-muted">
          Bids unsealed and Vickrey math shown here once the window closes.
        </p>
      </Card>
    );
  }

  const payload = resolved.payload as unknown as AuctionResolvedPayload;
  const { bids, winner, vickrey } = payload;
  const isDegenerate = vickrey.rule === "degenerate_single_bid";

  return (
    <Card className="border-terminal-accent/40">
      <CardHeader>
        <span>Auction resolved</span>
        <span className="text-terminal-accent">winner: {winner.agent_id}</span>
      </CardHeader>

      {/* Vickrey strike-through — the most important pedagogical visual */}
      <div className="mb-4 rounded-md border border-terminal-accent/40 bg-terminal-accent/5 p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-terminal-muted">
          Vickrey second-price rule
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-3 font-mono">
          <span className="text-terminal-text">{winner.agent_id} bid</span>
          <span className="text-2xl text-terminal-muted line-through decoration-terminal-danger decoration-2">
            {formatMoney(vickrey.winner_bid_price)}
          </span>
          <span className="text-terminal-muted">→</span>
          <span className="text-3xl font-semibold text-terminal-accent animate-pulse-once">
            pays {formatMoney(vickrey.price_paid)}
          </span>
          <span className="text-xs text-terminal-muted">
            {isDegenerate
              ? "(only one valid bid — degenerate, pays own bid)"
              : "(second-highest bid price)"}
          </span>
        </div>
        <p className="mt-3 text-xs text-terminal-muted">
          Truth-telling is the dominant strategy: a specialist who shaded their
          bid below true cost would risk winning at a loss; one who shaded
          above would only lose win probability without raising profit.
        </p>
      </div>

      {/* All bids ranked */}
      <div className="space-y-1">
        {bids.map((b, i) => (
          <div
            key={b.bid_id}
            className={cn(
              "flex items-center justify-between rounded px-2 py-1.5 text-xs",
              i === 0
                ? "bg-terminal-accent/10 text-terminal-text"
                : "text-terminal-muted",
            )}
          >
            <div className="flex items-center gap-3">
              <span className="w-4 font-mono text-terminal-muted">
                #{i + 1}
              </span>
              <span className="font-mono">{b.agent_id}</span>
              <span className="hidden md:inline">{b.capability_claim}</span>
            </div>
            <div className="flex items-center gap-6 font-mono">
              <span>
                <span className="text-terminal-muted">bid </span>
                {formatMoney(b.bid_price)}
              </span>
              <span>
                <span className="text-terminal-muted">score </span>
                {formatScore(b.score)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
