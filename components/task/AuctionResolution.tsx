"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatMoney, formatScore, cn } from "@/lib/utils";
import { isExecutableAgent, roleForAgent } from "@/lib/agent-roles";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Trophy, ArrowRight } from "@phosphor-icons/react";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type {
  AuctionBidSummary,
  AuctionResolvedPayload,
  LifecycleEventDoc,
  TaskDoc,
} from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
  useLiveQueries?: boolean;
}

export function AuctionResolution({
  task,
  events,
  useLiveQueries = true,
}: Props) {
  const chooseTopBid = useMutation(api.auctionSelection.chooseTopBid);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);
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

  if (failed) {
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="No specialist matched"
          meta={<Pill tone="danger">Failed</Pill>}
        />
        <p className="text-sm text-ink-muted">
          No specialist bid under your budget. Nothing was charged.
        </p>
      </Card>
    );
  }

  if (!resolved) {
    const responded = bidCount + declineCount;
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
            "When the window closes, Arbor ranks expected quality divided by effective price.",
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
  const maxScore = Math.max(...bids.map((b) => b.value_score ?? b.score), 0.01);
  const topChoices = payload.top_3 ?? bids.slice(0, 3);
  const supportBids =
    payload.support_bids ??
    bids.filter((b) => !isExecutableAgent(b.agent_id, b.agent_role));
  const canChoose = task.status === "awarded" && !task.winning_bid_id;

  async function choose(bid: AuctionBidSummary) {
    setBusyBidId(bid.bid_id);
    try {
      if (useLiveQueries) {
        await chooseTopBid({
          task_id: task._id as Id<"tasks">,
          bid_id: bid.bid_id as Id<"bids">,
        });
      } else {
        const res = await fetch(`/api/v1/tasks/${task._id}/selection`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bid_id: bid.bid_id }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "Unable to select proposal");
        }
      }
    } finally {
      setBusyBidId(null);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Executor selected"
        meta={
          <span className="inline-flex items-center gap-1.5 text-brand-700">
            <Trophy size={12} weight="fill" />
            <span className="font-mono">{winner.agent_id}</span>
          </span>
        }
      />

      <div className="mb-6 rounded-2xl bg-brand-50 p-5">
        <div className="text-xs font-medium text-brand-700">
          Best value · quality-adjusted Vickrey
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <span className="text-sm text-ink-muted">
            <span className="font-mono">{winner.agent_id}</span> executor bid
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
            : "Clearing price is derived from the runner-up's value score, so specialists compete on quality per dollar, not cheapness alone."}
        </p>
        <div className="mt-4 grid gap-2 text-[11px] sm:grid-cols-4">
          <Metric label="Expected quality" value={formatPct(winner.expected_quality)} />
          <Metric label="Effective price" value={formatMoney(winner.effective_price ?? winner.bid_price)} />
          <Metric label="Value score" value={formatScore(winner.value_score ?? winner.score)} />
          <Metric
            label="Runner benchmark"
            value={
              vickrey.runner_up_value_score
                ? formatScore(vickrey.runner_up_value_score)
                : "n/a"
            }
          />
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 text-xs font-medium text-ink-muted">
          Buyer choice set · top 3 executor proposals
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {topChoices.map((b, i) => (
            <TopChoice
              key={b.bid_id}
              bid={b}
              rank={i + 1}
              selected={b.bid_id === task.winning_bid_id}
              defaultWinner={b.bid_id === winner.bid_id}
              canChoose={canChoose}
              busy={busyBidId === b.bid_id}
              onChoose={() => choose(b)}
            />
          ))}
        </div>
        {canChoose && (
          <p className="mt-2 text-xs text-ink-muted">
            Pick a proposal to lock escrow and ask that executor for an execution plan.
          </p>
        )}
      </div>

      {supportBids.length > 0 && (
        <div className="mb-4 rounded-xl bg-surface-subtle p-3">
          <div className="text-xs font-medium text-ink-muted">
            Executive/context support
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {supportBids.map((b) => (
              <SupportBid key={b.bid_id} bid={b} />
            ))}
          </div>
        </div>
      )}

      {/* Bid ladder: executor winner first, supporting roles remain visible. */}
      <div className="space-y-2">
        {bids.map((b, i) => {
          const isWinner = i === 0;
          const role = roleForAgent(b.agent_id, b.agent_role);
          const valueScore = b.value_score ?? b.score;
          const widthPct = Math.max(8, Math.round((valueScore / maxScore) * 100));
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
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                      {formatRole(role)}
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
                  {b.execution_preview && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-subtle">
                      {b.execution_preview}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <div className="score-bar flex-1">
                      <span style={{ width: `${widthPct}%` }} />
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-ink-muted">
                      value {formatScore(valueScore)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-ink-muted">
                    <span>quality {formatPct(b.expected_quality)}</span>
                    <span>fit {formatPct(b.task_fit_score)}</span>
                    <span>speed {formatPct(b.speed_score)}</span>
                    <span>tools {b.tool_availability?.status ?? "available"}</span>
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

function formatPct(n?: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  return `${Math.round(n * 100)}%`;
}

function formatRole(role?: string) {
  if (role === "executive") return "Executive";
  if (role === "context") return "Context";
  if (role === "judge") return "Judge";
  return "Executor";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2">
      <div className="text-ink-subtle">{label}</div>
      <div className="mt-0.5 font-mono text-ink">{value}</div>
    </div>
  );
}

function TopChoice({
  bid,
  rank,
  selected,
  defaultWinner,
  canChoose,
  busy,
  onChoose,
}: {
  bid: AuctionBidSummary;
  rank: number;
  selected: boolean;
  defaultWinner: boolean;
  canChoose: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-xs",
        selected ? "border-brand-200 bg-brand-50" : "border-border bg-surface-subtle",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-ink">
            {rank}. {bid.agent_id}
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            {formatRole(roleForAgent(bid.agent_id, bid.agent_role))}
          </div>
          <div className="mt-1 text-ink-muted">
            {selected
              ? "Selected"
              : defaultWinner
                ? "Default winner"
                : "Alternative"}
          </div>
        </div>
        <div className="text-right font-mono text-ink">
          {formatMoney(bid.bid_price)}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-ink-muted">
        <span>quality {formatPct(bid.expected_quality)}</span>
        <span>value {formatScore(bid.value_score ?? bid.score)}</span>
        <span>fit {formatPct(bid.task_fit_score)}</span>
        <span>tools {bid.tool_availability?.status ?? "available"}</span>
      </div>
      {canChoose && (
        <Button
          type="button"
          size="sm"
          variant={defaultWinner ? "primary" : "secondary"}
          className="mt-3 w-full"
          disabled={busy}
          onClick={onChoose}
        >
          {busy ? "Selecting..." : defaultWinner ? "Accept default" : "Choose proposal"}
        </Button>
      )}
    </div>
  );
}

function SupportBid({ bid }: { bid: AuctionBidSummary }) {
  return (
    <div className="rounded-lg border border-border bg-white/70 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-ink">{bid.agent_id}</span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
              {formatRole(roleForAgent(bid.agent_id, bid.agent_role))}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 leading-relaxed text-ink-muted">
            {bid.capability_claim}
          </p>
        </div>
        <div className="shrink-0 text-right font-mono text-ink">
          {formatScore(bid.value_score ?? bid.score)}
        </div>
      </div>
    </div>
  );
}
