"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatMoney, formatScore, cn } from "@/lib/utils";
import { Trophy, ArrowRight } from "@phosphor-icons/react";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type {
  AuctionResolvedPayload,
  LifecycleEventDoc,
} from "@/lib/task-view";
import type { BidProbeDoc } from "./ProbeReceiptPanel";

interface Props {
  events: LifecycleEventDoc[];
  probes?: BidProbeDoc[];
}

export function AuctionResolution({ events, probes }: Props) {
  const resolved = events.find((e) => e.event_type === "auction_resolved");
  const failed = events.find((e) => e.event_type === "auction_failed");
  const bidCount = events.filter((e) => e.event_type === "bid_received").length;
  const declineCount = events.filter((e) => e.event_type === "bid_declined").length;
  // Anchor the elapsed counter on the first signal that the auction has work
  // to do — context_enriched (or task_posted as a fallback).
  const startEvent =
    events.find((e) => e.event_type === "context_enriched") ??
    events.find((e) => e.event_type === "task_posted");
  const elapsed = useElapsedSeconds(
    !resolved && !failed ? startEvent?.timestamp : undefined,
  );

  // Hoisted above the early returns below so hook order stays stable across
  // renders (Rules of Hooks). Depends only on `probes`, which is always present.
  const demoLaneProbes = useMemo(
    () =>
      probes
        ? probes.filter(
            (p) => p.probe_status === "demo_lane" || p.probe_status === "fail",
          )
        : [],
    [probes],
  );

  if (failed) {
    const reason =
      typeof failed.payload.reason === "string"
        ? failed.payload.reason
        : "No executable specialist bid was available.";
    const explanation = reason.includes("under budget")
      ? "No executable specialist bid met the auction requirements. Nothing was charged."
      : "The auction could not select an executable specialist. Nothing was charged.";
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="No specialist matched"
          meta={<Pill tone="danger">Failed</Pill>}
        />
        <p className="text-sm text-ink-muted">
          {explanation}
        </p>
        <p className="mt-2 font-mono text-xs text-ink-subtle">{reason}</p>
      </Card>
    );
  }

  if (!resolved) {
    const status =
      bidCount === 0 && declineCount === 0
        ? "Waiting for the first specialist to respond..."
        : `${bidCount} ${bidCount === 1 ? "specialist has" : "specialists have"} privately quoted${declineCount > 0 ? ` (${declineCount} declined)` : ""}.`;
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="Selecting your specialist"
          meta={<Pill tone="warning" pulse>Resolving</Pill>}
        />
        <LoadingProgress
          label="Sealed bids in flight"
          status={status}
          details={[
            "Quotes stay hidden — even from this view — until the window closes.",
            "When the window closes, the highest score wins and pays the runner-up's price (Vickrey).",
          ]}
          elapsedSeconds={elapsed}
          tone="warning"
        />
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
          const probe = probes?.find((p) => p.bid_id === b.bid_id);
          const publicTier = probe?.public_tier;
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
                    {publicTier === "native-a2a" && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800">
                        A2A
                      </span>
                    )}
                    {publicTier === "a2a-bridge" && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-teal-100 text-teal-800">
                        BRIDGE
                      </span>
                    )}
                    {publicTier === "not-a2a-yet" && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium italic bg-gray-200 text-gray-600">
                        DEMO
                      </span>
                    )}
                    {!publicTier && probes && probes.length > 0 && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-400">
                        —
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

      {/* Demo lane — agents that did not enter the auction */}
      {demoLaneProbes.length > 0 && (
        <details className="mt-4 rounded-lg border-dashed border border-gray-300 bg-gray-50">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-gray-600 select-none">
            Demo lane ({demoLaneProbes.length}{" "}
            {demoLaneProbes.length === 1 ? "agent" : "agents"} · not in auction)
          </summary>
          <div className="px-4 pb-3 pt-1 space-y-1.5">
            {demoLaneProbes.map((p) => (
              <div
                key={p._id}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500"
              >
                <span className="font-mono text-gray-700">{p.agent_id}</span>
                <span className="text-gray-400">·</span>
                <span className="italic text-gray-500">{p.public_tier}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">
                  {p.probe_status === "fail"
                    ? (p.error_message ?? "probe failed")
                    : "demo_lane — no live probe"}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
