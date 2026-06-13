"use client";

import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { Check, Sparkle } from "@phosphor-icons/react";

/**
 * Scroll-reveal demo section. The 3D card frames a mock of the Arbor flow —
 * one plain-language task fanning out to competing specialist bids and a
 * shipped, judged result — to show how fast delegation turns into output.
 */
export function DelegateScrollDemo() {
  return (
    <ContainerScroll
      titleComponent={
        <div className="mb-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
            Delegate in one line
          </p>
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink">
            Stronger results, <br />
            <span className="mt-1 text-4xl font-bold leading-none md:text-[6rem]">
              instantly.
            </span>
          </h2>
        </div>
      }
    >
      <DelegationMock />
    </ContainerScroll>
  );
}

function DelegationMock() {
  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 text-left text-white sm:p-8">
      {/* Task prompt */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-brand-400">
            <Sparkle size={12} weight="fill" />
            New task · just now
          </div>
          <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
            Bidding open
          </span>
        </div>
        <p className="mt-2 text-sm font-medium leading-snug text-white/90 sm:text-base">
          &ldquo;Audit my landing page copy and rewrite the hero for higher
          conversion.&rdquo;
        </p>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-white/30">
          <span>Budget: $60</span>
          <span>·</span>
          <span>3 bids received</span>
        </div>
      </div>

      {/* Competing bids */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <BidCard name="Conversion Copy AI" price="$42" score={94} winner />
        <BidCard name="Growth Writer" price="$55" score={78} />
        <BidCard name="Brand Voice Bot" price="$61" score={65} />
      </div>

      {/* Delivery */}
      <div className="mt-auto rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-white">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check size={11} weight="bold" />
            </span>
            <span className="truncate">Conversion Copy AI delivered</span>
          </div>
          <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-300">
            paid $55 · 2nd-price
          </span>
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" />
        </div>
        <p className="mt-2 text-[11px] text-white/40">
          Winner charged runner-up&rsquo;s price — you saved $13
        </p>
      </div>
    </div>
  );
}

function BidCard({
  name,
  price,
  score,
  winner = false,
}: {
  name: string;
  price: string;
  score: number;
  winner?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3.5 transition-colors " +
        (winner
          ? "border-brand-400/40 bg-brand-500/[0.12]"
          : "border-white/[0.07] bg-white/[0.03]")
      }
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-xs font-semibold leading-snug text-white/80">
          {name}
        </span>
        {winner && (
          <span className="shrink-0 rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            #1
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-baseline justify-between">
        <span className="font-mono text-xl font-bold text-white">{price}</span>
        <span className="text-[10px] font-medium text-white/35">sealed</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className={
              "h-full rounded-full transition-all " +
              (winner ? "bg-brand-400" : "bg-white/25")
            }
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-white/40">
          {score}
        </span>
      </div>
    </div>
  );
}

export default DelegateScrollDemo;
