"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { MarkdownLite } from "./MarkdownLite";
import {
  CheckCircle,
  CircleNotch,
  CreditCard,
  FileCode,
  FileText,
  GithubLogo,
  GoogleDriveLogo,
  Lightning,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { ArrowDown } from "@phosphor-icons/react";
import { useStickToLatest } from "@/lib/use-stick-to-latest";
import type { LifecycleEventDoc, TaskDoc } from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

interface DiagnosisReadyPayload {
  source: "drive" | "live" | "fallback";
  diagnosis: string;
  source_doc?: {
    filename: string;
    source_kind: string;
    drive_path?: string;
  } | null;
}

interface DriveDocPayload {
  filename: string;
  source_kind: string;
  drive_path?: string;
  via?: string;
  duration_ms?: number;
}

interface V0StartedPayload {
  mcp_endpoint: string;
  model: string;
  target_path: string;
}

interface V0DonePayload {
  patch_source: "v0" | "rule_based" | "docs";
  mcp_endpoint: string;
  model: string;
  target_path: string;
  ops_applied: string[];
  ops_missing: string[];
  duration_ms: number;
  patch_size_chars: number;
  patch_preview: string;
}

interface PrOpenedPayload {
  url: string;
  number: number;
  patch_source: "llm" | "hardcoded_replace" | "docs_fallback";
  target_path: string;
}

interface SourceDonePayload {
  duration_ms?: number;
  document_count?: number;
  tool?: string;
  mode?: string;
  summary_preview?: string;
}

interface BidReceivedPayload {
  bid_id: string;
  agent_id: string;
  sponsor?: string;
  capability_claim?: string;
  estimated_seconds?: number;
}

interface BidDeclinedPayload {
  agent_id: string;
  reason: string;
}

interface AuctionResolvedBid {
  bid_id: string;
  agent_id: string;
  bid_price: number;
  score: number;
  capability_claim?: string;
  estimated_seconds?: number;
}

interface AuctionResolvedPayload {
  bids: AuctionResolvedBid[];
  winner: {
    bid_id: string;
    agent_id: string;
    bid_price: number;
    score: number;
    estimated_seconds?: number;
  };
  vickrey: {
    winner_bid_price: number;
    price_paid: number;
    rule: string;
  };
}

function find(events: LifecycleEventDoc[], type: string) {
  return events.find((e) => e.event_type === type);
}

function findAll(events: LifecycleEventDoc[], type: string) {
  return events.filter((e) => e.event_type === type);
}

export function ConversionDropDemo({ task, events }: Props) {
  const triggered = find(events, "demo_triggered");
  const diagnoseStarted = find(events, "demo_diagnose_started");
  const driveDocFound = find(events, "demo_drive_doc_found");
  const hyperspellDone = find(events, "demo_hyperspell_done");
  const hyperspellSkipped = find(events, "demo_hyperspell_skipped");
  const niaDone = find(events, "demo_nia_done");
  const niaSkipped = find(events, "demo_nia_skipped");
  const diagnosisReady = find(events, "demo_diagnosis_ready");
  const bidReceived = findAll(events, "bid_received");
  const bidDeclined = findAll(events, "bid_declined");
  const auctionResolved = find(events, "auction_resolved");
  const paymentRequested = find(events, "demo_payment_requested");
  const paymentConfirmed = find(events, "demo_payment_confirmed");
  const v0Started = find(events, "demo_v0_started");
  const v0Done = find(events, "demo_v0_done");
  const fixStarted = find(events, "demo_fix_started");
  const prOpened = find(events, "demo_pr_opened");
  const failed = find(events, "demo_failed");

  const diagnosisPayload = diagnosisReady?.payload as
    | DiagnosisReadyPayload
    | undefined;
  const drivePayload = driveDocFound?.payload as
    | DriveDocPayload
    | undefined;
  const v0StartedPayload = v0Started?.payload as V0StartedPayload | undefined;
  const v0DonePayload = v0Done?.payload as V0DonePayload | undefined;
  const prPayload = prOpened?.payload as PrOpenedPayload | undefined;
  const auctionPayload = auctionResolved?.payload as
    | AuctionResolvedPayload
    | undefined;
  const auctionStarted = bidReceived.length > 0 || bidDeclined.length > 0;
  const evaluatedCount = bidReceived.length + bidDeclined.length;

  // Track a single signal that flips whenever any new content lands so the
  // auto-scroll fires at every meaningful step of the demo.
  const streamSignal = `${events.length}:${Boolean(prOpened)}:${Boolean(paymentConfirmed)}`;
  const { sentinelRef, hasNewBelow, scrollToLatest } =
    useStickToLatest(streamSignal);

  return (
    <div className="space-y-4">
      <Card className="animate-fade-up">
        <CardHeader title="Conversion drop diagnostic" />
        <p className="text-sm text-ink-soft">{task.prompt}</p>
      </Card>

      <Card className="animate-fade-up [animation-delay:60ms]">
        <CardHeader
          title="Step 1 — Diagnose"
          meta={
            <DiagnoseStatusPill
              started={Boolean(diagnoseStarted || triggered)}
              ready={Boolean(diagnosisReady)}
            />
          }
        />
        <div className="space-y-3">
          {drivePayload && <DriveDocRow payload={drivePayload} />}
          <div className="grid gap-2 sm:grid-cols-2">
            <SourceRow
              name="Hyperspell"
              done={hyperspellDone?.payload as SourceDonePayload | undefined}
              skippedReason={
                hyperspellSkipped
                  ? (hyperspellSkipped.payload as { reason?: string }).reason
                  : undefined
              }
              pending={Boolean(diagnoseStarted) && !hyperspellDone && !hyperspellSkipped}
              kind="business"
            />
            <SourceRow
              name="Nia"
              done={niaDone?.payload as SourceDonePayload | undefined}
              skippedReason={
                niaSkipped
                  ? (niaSkipped.payload as { reason?: string }).reason
                  : undefined
              }
              pending={Boolean(diagnoseStarted) && !niaDone && !niaSkipped}
              kind="repo"
            />
          </div>

          {diagnosisPayload ? (
            <div className="rounded-xl bg-surface-muted p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                  Diagnosis
                </span>
                <DiagnosisSourcePill payload={diagnosisPayload} />
              </div>
              <MarkdownLite text={diagnosisPayload.diagnosis} />
            </div>
          ) : diagnoseStarted ? (
            <PendingRow text="Reading the analysis doc…" />
          ) : null}
        </div>
      </Card>

      <Card className="animate-fade-up [animation-delay:120ms]">
        <CardHeader
          title="Step 2 — Specialist auction"
          meta={
            <AuctionStatusPill
              started={auctionStarted}
              resolved={Boolean(auctionResolved)}
            />
          }
        />
        {auctionStarted ? (
          <AuctionPanel
            bidReceived={bidReceived.map(
              (e) => e.payload as unknown as BidReceivedPayload,
            )}
            bidDeclined={bidDeclined.map(
              (e) => e.payload as unknown as BidDeclinedPayload,
            )}
            resolved={auctionPayload}
            evaluatedCount={evaluatedCount}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            Opening sealed-bid auction across the marketplace…
          </p>
        )}
      </Card>

      <Card className="animate-fade-up [animation-delay:180ms]">
        <CardHeader
          title="Step 3 — Confirm and pay"
          meta={
            <PaymentStatusPill
              requested={Boolean(paymentRequested)}
              confirmed={Boolean(paymentConfirmed)}
            />
          }
        />
        {paymentConfirmed ? (
          <PaymentConfirmedRow
            winnerAgentId={auctionPayload?.winner.agent_id}
            pricePaid={auctionPayload?.vickrey.price_paid ?? task.price_paid}
          />
        ) : paymentRequested && auctionPayload ? (
          <ConfirmAndPayForm
            taskId={task._id as Id<"tasks">}
            winnerAgentId={auctionPayload.winner.agent_id}
            winnerBidPrice={auctionPayload.winner.bid_price}
            pricePaid={auctionPayload.vickrey.price_paid}
            rule={auctionPayload.vickrey.rule}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            Waiting for the auction to resolve.
          </p>
        )}
      </Card>

      <Card className="animate-fade-up [animation-delay:240ms]">
        <CardHeader
          title="Step 4 — Winner ships the fix"
          meta={
            <FixStatusPill
              started={Boolean(fixStarted || v0StartedPayload)}
              pr={Boolean(prOpened)}
              failed={Boolean(failed)}
            />
          }
        />
        {failed ? (
          <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <Warning size={14} weight="bold" /> Fix step failed
            </div>
            {(failed.payload as { reason?: string }).reason}
          </div>
        ) : (
          <div className="space-y-3">
            {v0DonePayload ? (
              <V0Result payload={v0DonePayload} />
            ) : v0StartedPayload ? (
              <V0Calling payload={v0StartedPayload} />
            ) : !paymentConfirmed ? (
              <p className="text-sm text-ink-muted">
                Waiting for payment confirmation.
              </p>
            ) : (
              <PendingRow text="Handing the diagnosis to the winner…" />
            )}

            {prPayload ? (
              <a
                href={prPayload.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/90"
              >
                <GithubLogo size={16} weight="fill" />
                View PR on GitHub
              </a>
            ) : v0DonePayload ? (
              <PendingRow text="Committing the patch and opening the PR…" />
            ) : null}
          </div>
        )}
      </Card>

      {prPayload && (
        <FeedbackCard winnerAgentId={auctionPayload?.winner.agent_id} />
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {hasNewBelow && (
        <button
          type="button"
          onClick={scrollToLatest}
          className="fixed bottom-6 left-1/2 z-30 inline-flex -translate-x-1/2 animate-fade-up items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-ink/90"
        >
          <ArrowDown size={14} weight="bold" />
          See latest
        </button>
      )}
    </div>
  );
}

function FeedbackCard({
  winnerAgentId,
}: {
  winnerAgentId: string | undefined;
}) {
  const [choice, setChoice] = useState<"none" | "good" | "bad">("none");
  const agentLabel = winnerAgentId ? (
    <span className="font-mono text-ink">{winnerAgentId}</span>
  ) : (
    <span>the winning specialist</span>
  );

  return (
    <Card className="animate-fade-up [animation-delay:300ms]">
      <CardHeader title="Was this a good solution?" />
      {choice === "none" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            Did {agentLabel} actually solve the conversion drop the way
            you&rsquo;d expect? Your feedback flows back into the
            specialist&rsquo;s reputation score for future auctions.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChoice("good")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <ThumbsUp size={16} weight="bold" />
              Good solution
            </button>
            <button
              type="button"
              onClick={() => setChoice("bad")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
            >
              <ThumbsDown size={16} weight="bold" />
              Needs more work
            </button>
          </div>
        </div>
      ) : (
        <div
          className={
            choice === "good"
              ? "flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
              : "flex items-start gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-900"
          }
        >
          {choice === "good" ? (
            <ThumbsUp size={18} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" />
          ) : (
            <ThumbsDown size={18} weight="fill" className="mt-0.5 shrink-0 text-rose-600" />
          )}
          <div>
            <div className="font-medium">
              {choice === "good"
                ? "Thanks — reputation bumped."
                : "Thanks — reputation noted."}
            </div>
            <p className="mt-0.5 text-xs">
              {choice === "good"
                ? "We'll prioritize this specialist on similar tasks next time."
                : "We'll deprioritize this specialist on similar tasks next time."}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function AuctionPanel({
  bidReceived,
  bidDeclined,
  resolved,
  evaluatedCount,
}: {
  bidReceived: BidReceivedPayload[];
  bidDeclined: BidDeclinedPayload[];
  resolved: AuctionResolvedPayload | undefined;
  evaluatedCount: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span>
          <span className="font-mono text-ink">{evaluatedCount}</span>{" "}
          specialists evaluated
        </span>
        <span aria-hidden>·</span>
        <span className="text-emerald-700">
          <span className="font-mono">{bidReceived.length}</span> bid
        </span>
        <span aria-hidden>·</span>
        <span className="text-amber-700">
          <span className="font-mono">{bidDeclined.length}</span> declined
        </span>
      </div>

      <div className="space-y-2">
        {bidReceived.map((bid) => (
          <BidRow
            key={bid.bid_id}
            bid={bid}
            winnerId={resolved?.winner.agent_id}
            resolvedBids={resolved?.bids}
          />
        ))}
      </div>

      {bidDeclined.length > 0 && (
        <details className="rounded-xl bg-surface-muted/60 p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted">
            Declined ({bidDeclined.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {bidDeclined.map((d) => (
              <li
                key={d.agent_id}
                className="flex animate-fade-in items-start gap-2 text-xs text-ink-muted"
              >
                <XCircle
                  size={12}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-amber-500"
                />
                <span>
                  <span className="font-mono text-ink-soft">{d.agent_id}</span>
                  <span className="text-ink-muted"> — {d.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {resolved && <WinnerCard payload={resolved} />}
    </div>
  );
}

function BidRow({
  bid,
  winnerId,
  resolvedBids,
}: {
  bid: BidReceivedPayload;
  winnerId: string | undefined;
  resolvedBids: AuctionResolvedBid[] | undefined;
}) {
  const isWinner = winnerId === bid.agent_id;
  const resolved = resolvedBids?.find((b) => b.agent_id === bid.agent_id);
  return (
    <div
      className={
        isWinner
          ? "animate-fade-down rounded-xl bg-brand-50 p-3 ring-1 ring-inset ring-brand-200"
          : "animate-fade-down rounded-xl border border-line bg-white p-3"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-ink">{bid.agent_id}</span>
        {bid.sponsor && (
          <span className="text-[11px] text-ink-muted">{bid.sponsor}</span>
        )}
        {isWinner && (
          <Pill tone="brand">
            <Trophy size={11} weight="fill" /> winner
          </Pill>
        )}
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-ink-muted">
          {resolved && <span>score {resolved.score.toFixed(2)}</span>}
          {typeof bid.estimated_seconds === "number" && (
            <span>~{bid.estimated_seconds}s</span>
          )}
        </span>
      </div>
      {bid.capability_claim && (
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          {bid.capability_claim}
        </p>
      )}
    </div>
  );
}

function WinnerCard({ payload }: { payload: AuctionResolvedPayload }) {
  const { winner, vickrey } = payload;
  return (
    <div className="rounded-xl bg-ink p-3 text-white">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Trophy size={12} weight="fill" className="text-amber-300" />
        <span className="font-medium">Awarded to</span>
        <span className="font-mono">{winner.agent_id}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-300">
        <span>
          bid{" "}
          <span className="font-mono text-white">
            {Math.round(winner.bid_price * 100)} credits
          </span>
        </span>
        <span>
          paid{" "}
          <span className="font-mono text-white">
            {Math.round(vickrey.price_paid * 100)} credits
          </span>{" "}
          <span className="text-zinc-400">(Vickrey, second-price)</span>
        </span>
        <span>
          score{" "}
          <span className="font-mono text-white">{winner.score.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}

function AuctionStatusPill({
  started,
  resolved,
}: {
  started: boolean;
  resolved: boolean;
}) {
  if (resolved) return <Pill tone="brand">awarded</Pill>;
  if (started) return <Pill tone="neutral">collecting bids</Pill>;
  return <Pill tone="neutral">queued</Pill>;
}

function SourceRow({
  name,
  done,
  skippedReason,
  pending,
  kind,
}: {
  name: string;
  done: SourceDonePayload | undefined;
  skippedReason: string | undefined;
  pending: boolean;
  kind: "business" | "repo";
}) {
  const status = done ? "done" : skippedReason ? "skipped" : pending ? "pending" : "idle";
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{name}</span>
        {status === "done" && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle size={14} weight="fill" />
            {done?.duration_ms ? `${(done.duration_ms / 1000).toFixed(1)}s` : "ok"}
          </span>
        )}
        {status === "skipped" && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <XCircle size={14} weight="fill" />
            skipped
          </span>
        )}
        {status === "pending" && (
          <CircleNotch size={14} className="animate-spin text-ink-muted" />
        )}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {status === "done"
          ? done?.summary_preview?.slice(0, 140) ||
            (kind === "business"
              ? "Workspace memory returned"
              : `${done?.tool ?? "search"}/${done?.mode ?? "indexed"}`)
          : status === "skipped"
            ? skippedReason ?? "no result"
            : status === "pending"
              ? kind === "business"
                ? "Searching workspace memory…"
                : "Querying indexed repo…"
              : kind === "business"
                ? "Workspace memory"
                : "Repo retrieval"}
      </p>
    </div>
  );
}

function DriveDocRow({ payload }: { payload: DriveDocPayload }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-hairline">
        <GoogleDriveLogo size={16} weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
          <span className="inline-flex items-center gap-1.5">
            <FileText size={13} weight="bold" className="text-brand-700" />
            {payload.filename}
          </span>
          <Pill tone="brand">Google Drive</Pill>
          {payload.via && (
            <span className="text-[11px] text-ink-muted">via {payload.via}</span>
          )}
        </div>
        {payload.drive_path && (
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-muted">
            {payload.drive_path}
          </p>
        )}
        <p className="mt-1 text-xs text-ink-soft">
          Found a written analysis from the growth lead — using it as the
          source of truth for the diagnosis.
        </p>
      </div>
      {typeof payload.duration_ms === "number" && (
        <span className="shrink-0 font-mono text-[11px] text-ink-muted">
          {(payload.duration_ms / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

function DiagnosisSourcePill({ payload }: { payload: DiagnosisReadyPayload }) {
  if (payload.source === "drive") {
    return (
      <Pill tone="brand">
        <GoogleDriveLogo size={11} weight="fill" />
        From {payload.source_doc?.filename ?? "Google Drive"}
      </Pill>
    );
  }
  if (payload.source === "live") return <Pill tone="brand">live evidence</Pill>;
  return <Pill tone="neutral">synthesized</Pill>;
}

function ConfirmAndPayForm({
  taskId,
  winnerAgentId,
  winnerBidPrice,
  pricePaid,
  rule,
}: {
  taskId: Id<"tasks">;
  winnerAgentId: string;
  winnerBidPrice: number;
  pricePaid: number;
  rule: string;
}) {
  const confirm = useAction(api.demos.confirmAndShipConversionDrop);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVickrey = rule === "second_highest_bid_price";
  const savings = Math.max(0, winnerBidPrice - pricePaid);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await confirm({ task_id: taskId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          <Trophy size={14} weight="fill" className="text-brand-700" />
          <span className="font-mono">{winnerAgentId}</span> won the auction
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-ink-muted">Their offer</dt>
            <dd className="mt-0.5 font-mono text-ink line-through decoration-rose-400 decoration-2">
              {Math.round(winnerBidPrice * 100)} credits
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">You pay</dt>
            <dd className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-brand-700">
              {Math.round(pricePaid * 100)} credits
            </dd>
          </div>
        </dl>
        {isVickrey && savings > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            Vickrey second-price · you save{" "}
            <span className="font-mono text-ink">{Math.round(savings * 100)} credits</span>{" "}
            vs. the winner&rsquo;s offer.
          </p>
        )}
      </div>
      <Button
        onClick={onConfirm}
        disabled={submitting}
        className="w-full"
        size="lg"
      >
        {submitting ? (
          <>
            <CircleNotch size={16} className="animate-spin" weight="bold" />
            Confirming payment…
          </>
        ) : (
          <>
            <CreditCard size={16} weight="bold" />
            Confirm and pay {Math.round(pricePaid * 100)} credits
          </>
        )}
      </Button>
      <p className="text-xs text-ink-muted">
        Funds are held in escrow and only released once the agent ships the
        fix and the judge accepts.
      </p>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

function PaymentConfirmedRow({
  winnerAgentId,
  pricePaid,
}: {
  winnerAgentId: string | undefined;
  pricePaid: number | undefined;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
      <ShieldCheck size={18} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" />
      <div>
        <div className="font-medium">
          {typeof pricePaid === "number"
            ? `${Math.round(pricePaid * 100)} credits held in escrow`
            : "Payment held in escrow"}
          {winnerAgentId && (
            <>
              {" · "}
              <span className="font-mono text-emerald-800">
                {winnerAgentId}
              </span>{" "}
              cleared to ship
            </>
          )}
        </div>
        <p className="mt-0.5 text-xs text-emerald-800/80">
          Released after the judge accepts the result.
        </p>
      </div>
    </div>
  );
}

function PaymentStatusPill({
  requested,
  confirmed,
}: {
  requested: boolean;
  confirmed: boolean;
}) {
  if (confirmed) return <Pill tone="success">paid</Pill>;
  if (requested) return <Pill tone="warning" pulse>action needed</Pill>;
  return <Pill tone="neutral">queued</Pill>;
}

function V0Calling({ payload }: { payload: V0StartedPayload }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-ink-soft">
        <CircleNotch size={14} weight="bold" className="animate-spin text-brand-700" />
        <span>
          <span className="font-mono text-ink">vercel-v0</span> calling{" "}
          <span className="font-mono text-ink">{payload.model}</span> over MCP
          to patch{" "}
          <span className="font-mono text-ink">{payload.target_path}</span>
          <span className="streaming-caret" />
        </span>
      </div>
      <div className="rounded-xl bg-surface-muted p-3 font-mono text-[11px] text-ink-muted">
        POST {payload.mcp_endpoint}
      </div>
      <div className="space-y-2">
        <div className="shimmer h-3 w-full rounded" />
        <div className="shimmer h-3 w-5/6 rounded" />
        <div className="shimmer h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

function V0Result({ payload }: { payload: V0DonePayload }) {
  const sourceLabel =
    payload.patch_source === "v0"
      ? "model-generated patch"
      : payload.patch_source === "rule_based"
        ? "rule-based patch (v0 unavailable)"
        : "docs-only patch (target file missing)";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Pill tone={payload.patch_source === "v0" ? "brand" : "neutral"}>
          <Lightning size={11} weight="fill" />
          {sourceLabel}
        </Pill>
        <span className="font-mono text-[11px] text-ink-soft">
          {payload.target_path}
        </span>
        <span className="text-[11px] text-ink-muted">
          {(payload.duration_ms / 1000).toFixed(1)}s · {payload.patch_size_chars.toLocaleString()} chars
        </span>
      </div>
      <div className="rounded-xl bg-surface-muted p-3 font-mono text-[11px] text-ink-muted">
        <div className="mb-1 flex items-center gap-1.5 text-ink-soft">
          <FileCode size={12} weight="bold" />
          {payload.target_path}
        </div>
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-ink-soft">
          {payload.patch_preview}
        </pre>
      </div>
      {payload.ops_applied.length > 0 && (
        <div className="text-[11px] text-ink-muted">
          <span className="font-medium text-ink-soft">Operations applied:</span>{" "}
          {payload.ops_applied.map((op) => (
            <code
              key={op}
              className="mx-0.5 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-ink-soft"
            >
              {op}
            </code>
          ))}
        </div>
      )}
      {payload.ops_missing.length > 0 && (
        <div className="text-[11px] text-ink-muted">
          <span className="font-medium text-ink-soft">Skipped:</span>{" "}
          {payload.ops_missing.map((op) => (
            <code
              key={op}
              className="mx-0.5 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-ink-muted"
            >
              {op}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted">
      <CircleNotch size={14} className="animate-spin" />
      {text}
    </div>
  );
}

function DiagnoseStatusPill({
  started,
  ready,
}: {
  started: boolean;
  ready: boolean;
}) {
  if (ready) return <Pill tone="brand">complete</Pill>;
  if (started) return <Pill tone="neutral">in progress</Pill>;
  return <Pill tone="neutral">queued</Pill>;
}

function FixStatusPill({
  started,
  pr,
  failed,
}: {
  started: boolean;
  pr: boolean;
  failed: boolean;
}) {
  if (failed) return <Pill tone="neutral">failed</Pill>;
  if (pr) return <Pill tone="brand">PR opened</Pill>;
  if (started) return <Pill tone="neutral">applying</Pill>;
  return <Pill tone="neutral">queued</Pill>;
}
