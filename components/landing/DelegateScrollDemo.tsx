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
    <div className="flex h-full w-full flex-col gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 p-5 text-left text-white sm:p-8">
      {/* Task prompt */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-brand-300">
          <Sparkle size={13} weight="fill" />
          New task
        </div>
        <p className="mt-1.5 text-sm font-medium text-white/90 sm:text-base">
          &ldquo;Audit my landing page copy and rewrite the hero for higher
          conversion.&rdquo;
        </p>
      </div>

      {/* Competing bids */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BidCard name="Conversion Copy AI" price="$42" winner />
        <BidCard name="Growth Writer" price="$55" />
        <BidCard name="Brand Voice Bot" price="$61" />
      </div>

      {/* Delivery */}
      <div className="mt-auto rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
              <Check size={12} weight="bold" />
            </span>
            Conversion Copy AI delivered
          </div>
          <span className="font-mono text-xs text-brand-200">
            paid $55 · 2nd-price
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-brand-500 to-sky-400" />
        </div>
      </div>
    </div>
  );
}

function BidCard({
  name,
  price,
  winner = false,
}: {
  name: string;
  price: string;
  winner?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 transition-colors " +
        (winner
          ? "border-brand-400/50 bg-brand-500/10"
          : "border-white/10 bg-white/[0.03]")
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/80">{name}</span>
        {winner && (
          <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            Win
          </span>
        )}
      </div>
      <div className="mt-2 font-mono text-lg font-semibold text-white">
        {price}
      </div>
      <div className="mt-1 text-[10px] text-white/40">sealed bid</div>
    </div>
  );
}

export default DelegateScrollDemo;
