import type { ReactNode } from "react";
import { Tree } from "@phosphor-icons/react/dist/ssr";
import {
  EnvelopeSimple,
  SlackLogo,
  GoogleDriveLogo,
  FileCode,
  GitBranch,
  Files,
  Database,
  Robot,
  Trophy,
  Sparkle,
  ArrowRight,
  CheckCircle,
  TrendDown,
  TrendUp,
} from "@phosphor-icons/react";

/* ---------------------------------------------------------------- */
/* Shared layout primitives                                          */
/* ---------------------------------------------------------------- */

function Stage({
  children,
  eyebrow,
  align = "center",
}: {
  children: ReactNode;
  eyebrow?: string;
  align?: "center" | "start";
}) {
  return (
    <section
      className={`relative flex h-full w-full flex-col px-[clamp(2rem,6vw,6rem)] py-[clamp(2rem,6vh,5rem)] ${
        align === "center" ? "items-center justify-center text-center" : "items-start justify-center"
      }`}
    >
      {eyebrow && (
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 animate-fade-down">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
          {eyebrow}
        </div>
      )}
      {children}
    </section>
  );
}

function Headline({
  children,
  size = "lg",
  className = "",
}: {
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeCls =
    size === "xl"
      ? "text-[clamp(3rem,7vw,6rem)] leading-[1.02]"
      : size === "lg"
        ? "text-[clamp(2.25rem,5.5vw,4.5rem)] leading-[1.05]"
        : "text-[clamp(1.75rem,3.5vw,3rem)] leading-[1.1]";
  return (
    <h2
      className={`max-w-[22ch] font-display font-semibold tracking-tight text-ink ${sizeCls} ${className}`}
    >
      {children}
    </h2>
  );
}

/* ---------- Brand marks ----------------------------------------- */

function ArborLogo({ size = 1 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3 text-ink">
      <span
        className="inline-flex items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card"
        style={{ width: 56 * size, height: 56 * size }}
      >
        <Tree size={28 * size} weight="fill" />
      </span>
      <span
        className="font-display font-bold tracking-tight"
        style={{ fontSize: 40 * size }}
      >
        Arbor
      </span>
    </span>
  );
}

function HyperspellLogo({ size = 1 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3 text-ink">
      <span
        className="inline-flex items-center justify-center rounded-2xl text-white shadow-card"
        style={{
          width: 56 * size,
          height: 56 * size,
          background: "linear-gradient(135deg,#7c3aed 0%,#c026d3 100%)",
        }}
      >
        <Sparkle size={26 * size} weight="fill" />
      </span>
      <span
        className="font-display font-bold tracking-tight"
        style={{ fontSize: 36 * size }}
      >
        hyperspell
      </span>
    </span>
  );
}

function NiaLogo({ size = 1 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3 text-ink">
      <span
        className="inline-flex items-center justify-center rounded-2xl bg-ink text-white shadow-card"
        style={{ width: 56 * size, height: 56 * size }}
      >
        <span
          className="font-display font-bold leading-none"
          style={{ fontSize: 30 * size }}
        >
          n
        </span>
      </span>
      <span
        className="font-display font-bold tracking-tight"
        style={{ fontSize: 36 * size }}
      >
        nia
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Slides                                                            */
/* ---------------------------------------------------------------- */

function CoverSlide() {
  return (
    <Stage>
      <div style={{ animation: "deck-pop 700ms cubic-bezier(0.22,1,0.36,1) both" }}>
        <ArborLogo size={1.4} />
      </div>
      <p className="mt-10 max-w-[28ch] font-display text-[clamp(1.5rem,2.6vw,2.4rem)] font-medium leading-tight text-ink-soft animate-fade-up [animation-delay:300ms]">
        Find the right specialist for any task.
      </p>
    </Stage>
  );
}

function ProblemSlide() {
  return (
    <Stage eyebrow="The problem">
      <Headline size="xl">
        You&apos;re <span className="text-brand-600">overpaying</span> the generalist.
      </Headline>
    </Stage>
  );
}

function SpecialistsWinSlide() {
  return (
    <Stage>
      <Headline size="xl">
        Faster.
        <br />
        Cheaper.
        <br />
        <span className="text-brand-600">More accurate.</span>
      </Headline>
    </Stage>
  );
}

function ImpracticalSlide() {
  const items = [
    "Sign up for 10+ providers",
    "Stitch context across them",
    "Orchestrate by hand (yuck)",
  ];
  return (
    <Stage eyebrow="The catch">
      <Headline size="lg">
        But using them is <span className="text-danger">impractical</span>.
      </Headline>
      <ul className="deck-stagger mt-14 flex flex-col gap-5">
        {items.map((label) => (
          <li
            key={label}
            className="flex items-center gap-4 font-display text-[clamp(1.5rem,2.8vw,2.4rem)] font-medium text-ink"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger/10 text-danger">
              <span className="text-xl font-bold leading-none">×</span>
            </span>
            {label}
          </li>
        ))}
      </ul>
    </Stage>
  );
}

function ArborRevealSlide() {
  return (
    <Stage>
      <div style={{ animation: "deck-pop 700ms cubic-bezier(0.22,1,0.36,1) both" }}>
        <ArborLogo size={1.4} />
      </div>
      <div className="mt-12 animate-fade-up [animation-delay:300ms]">
        <Headline size="md">
          Efficiency through unified access to{" "}
          <span className="text-brand-600">specialized agents</span>.
        </Headline>
      </div>
    </Stage>
  );
}

/* ---------- How-it-works flow diagram ---------------------------- */

function FlowStep({
  icon: Icon,
  label,
  delay,
}: {
  icon: typeof Sparkle;
  label: string;
  delay: number;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3"
      style={{
        animation: `fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-card">
        <Icon size={28} weight="bold" />
      </div>
      <div className="text-sm font-semibold text-ink">{label}</div>
    </div>
  );
}

function FlowArrow({ delay }: { delay: number }) {
  return (
    <div
      className="flex items-center text-ink-faint"
      style={{
        animation: "fade-in 0.5s ease-out both",
        animationDelay: `${delay}ms`,
      }}
    >
      <ArrowRight size={20} weight="bold" />
    </div>
  );
}

function HowItWorksSlide() {
  return (
    <Stage eyebrow="How it works">
      <Headline>Split. Auction. Execute. Evaluate.</Headline>
      <div className="mt-16 flex w-full max-w-6xl items-center justify-between rounded-3xl bg-surface-subtle px-10 py-12 shadow-hairline">
        <FlowStep icon={Sparkle} label="Task in" delay={120} />
        <FlowArrow delay={300} />
        <FlowStep icon={GitBranch} label="Split" delay={420} />
        <FlowArrow delay={600} />
        <FlowStep icon={Trophy} label="Auction" delay={720} />
        <FlowArrow delay={900} />
        <FlowStep icon={Robot} label="Execute" delay={1020} />
        <FlowArrow delay={1200} />
        <FlowStep icon={CheckCircle} label="Evaluate" delay={1320} />
      </div>
    </Stage>
  );
}

/* ---------- Auction slide --------------------------------------- */

function AuctionCard({
  name,
  bid,
  pitch,
  rep,
  winner,
  delay,
}: {
  name: string;
  bid: string;
  pitch: string;
  rep: number;
  winner?: boolean;
  delay: number;
}) {
  return (
    <div
      className={`relative rounded-2xl border bg-white p-6 text-left shadow-card transition-all ${
        winner ? "border-brand-600 ring-4 ring-brand-100" : "border-line"
      }`}
      style={{
        animation: "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: `${delay}ms`,
      }}
    >
      {winner && (
        <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
          <Trophy size={12} weight="fill" /> winner
        </span>
      )}
      <div className="flex items-center justify-between">
        <div className="font-display text-lg font-semibold text-ink">{name}</div>
        <div className="font-display text-2xl font-bold text-brand-700 tabular-nums">
          {bid}
        </div>
      </div>
      <div className="mt-2 text-sm text-ink-soft">{pitch}</div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-end justify-between">
          <span className="text-sm font-semibold text-ink">Reputation</span>
          <span
            className={`font-display text-xl font-bold tabular-nums ${
              winner ? "text-brand-700" : "text-ink"
            }`}
          >
            {rep}
          </span>
        </div>
        <div
          className="relative h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
          aria-hidden
        >
          <span
            className="absolute inset-y-0 left-0 block rounded-full bg-brand-600 transition-[width] duration-700 ease-out"
            style={{ width: `${rep}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function AuctionSlide() {
  return (
    <Stage eyebrow="The auction">
      <Headline size="md">Choose the best specialist in an auction.</Headline>
      <div className="mt-12 grid w-full max-w-5xl grid-cols-3 gap-5">
        <AuctionCard
          name="StripeOps"
          bid="$0.40"
          pitch="Audit Stripe webhook + payment intents."
          rep={71}
          delay={300}
        />
        <AuctionCard
          name="FlowDoctor"
          bid="$0.18"
          pitch="Diff the funnel events from the deploy date."
          rep={92}
          winner
          delay={500}
        />
        <AuctionCard
          name="Generalist-XL"
          bid="$3.20"
          pitch="Try a few things and see what sticks."
          rep={54}
          delay={700}
        />
      </div>
    </Stage>
  );
}

/* ---------- Reputation loop ------------------------------------- */

function ReputationSlide() {
  return (
    <Stage eyebrow="Reputation">
      <Headline>
        A market that gets <span className="text-brand-600">smarter</span> every
        run.
      </Headline>

      <div className="mt-14 grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-stretch gap-8">
        <div
          className="rounded-3xl bg-white p-7 shadow-card"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "200ms" }}
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
            <TrendUp size={20} weight="bold" />
          </div>
          <div className="mt-4 font-display text-2xl font-semibold text-ink">
            Cheap &amp; correct
          </div>
          <div className="mt-5 flex items-center gap-3 text-sm">
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
              <span
                className="absolute inset-y-0 left-0 block rounded-full bg-brand-600"
                style={{ width: "84%" }}
              />
            </div>
            <span className="font-display text-xl font-bold tabular-nums text-brand-700">
              84
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div
            className="relative h-40 w-40"
            style={{ animation: "fade-in 0.8s ease-out both", animationDelay: "400ms" }}
          >
            <svg viewBox="0 0 160 160" className="h-full w-full">
              <circle
                cx="80"
                cy="80"
                r="62"
                fill="none"
                stroke="#1877f2"
                strokeWidth="2"
                strokeDasharray="6 8"
              />
              <path d="M80 18 L 88 26 L 72 26 Z" fill="#1877f2" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="font-display text-4xl font-bold text-brand-700">↻</div>
                <div className="mt-1 text-sm font-semibold text-ink">evaluate</div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl bg-white p-7 shadow-card"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "600ms" }}
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <TrendDown size={20} weight="bold" />
          </div>
          <div className="mt-4 font-display text-2xl font-semibold text-ink">
            Overspent or failed
          </div>
          <div className="mt-5 flex items-center gap-3 text-sm">
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
              <span
                className="absolute inset-y-0 left-0 block rounded-full"
                style={{ width: "26%", backgroundColor: "#ef4444" }}
              />
            </div>
            <span className="font-display text-xl font-bold tabular-nums text-danger">
              26
            </span>
          </div>
        </div>
      </div>
    </Stage>
  );
}

function EvolvingSlide() {
  return (
    <Stage>
      <Headline size="xl">
        Arbor is{" "}
        <span className="text-brand-600">constantly evolving</span>.
      </Headline>
    </Stage>
  );
}

/* ---------- Demo: scenario -------------------------------------- */

function DemoScenarioSlide() {
  return (
    <Stage eyebrow="Demo" align="start">
      <Headline>Say you&apos;re the CTO of a startup.</Headline>
      <div className="mt-10 grid w-full max-w-5xl grid-cols-[auto_1fr] items-start gap-6 rounded-3xl bg-white p-7 shadow-card">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <EnvelopeSimple size={22} weight="bold" />
        </div>
        <div>
          <div className="text-sm font-medium text-ink-muted">
            New email · 2 minutes ago
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">
            Conversion drop on the upgrade flow
          </div>
          <div className="mt-3 text-base text-ink-soft">
            Free-to-paid conversion is{" "}
            <span className="font-semibold text-danger">down 70%</span> in the
            last 24 hours. Need eyes on this asap.
          </div>
        </div>
      </div>
    </Stage>
  );
}

function PromptSlide() {
  return (
    <Stage>
      <div className="text-base font-medium text-ink animate-fade-down">
        you, to Arbor:
      </div>
      <div
        className="mt-6 rounded-3xl bg-white px-12 py-10 font-display text-[clamp(1.75rem,3.6vw,3rem)] font-medium leading-tight text-ink shadow-card"
        style={{ animation: "deck-pop 700ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        “Fix the conversion drop we just saw.”
      </div>
    </Stage>
  );
}

/* ---------- Hyperspell + Nia ------------------------------------ */

function SourceIcon({
  icon: Icon,
  delay,
  className = "",
  color,
  size = 32,
}: {
  icon: typeof Sparkle;
  delay: number;
  className?: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      className={`absolute inline-flex items-center justify-center rounded-2xl bg-white shadow-card ${className}`}
      style={{
        animation: "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: `${delay}ms`,
        width: 76,
        height: 76,
      }}
    >
      <Icon size={size} weight="fill" style={{ color }} />
    </div>
  );
}

function CenterMark({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute inset-0 -z-10 rounded-3xl bg-brand-100"
        style={{ animation: "deck-pulse-ring 2.4s ease-out infinite" }}
      />
      <div className="rounded-3xl bg-white px-7 py-5 shadow-card">{children}</div>
    </div>
  );
}

function RadialDiagram({
  center,
  sources,
}: {
  center: ReactNode;
  sources: { icon: typeof Sparkle; color: string; pos: string; delay: number }[];
}) {
  // Lines drawn from each source position toward the center (400, 180).
  const lineFor = (pos: string) => {
    const map: Record<string, string> = {
      "left-[6%] top-[10%]": "M120 60 L 380 180",
      "right-[8%] top-[6%]": "M680 50 L 420 180",
      "left-[2%] top-[58%]": "M70 230 L 380 200",
      "right-[2%] top-[60%]": "M730 230 L 420 200",
      "left-[42%] top-[88%]": "M400 320 L 400 230",
    };
    return map[pos];
  };
  return (
    <div className="relative h-[380px] w-full max-w-4xl">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {center}
      </div>
      {sources.map((s, i) => (
        <SourceIcon
          key={i}
          icon={s.icon}
          color={s.color}
          delay={s.delay}
          className={s.pos}
        />
      ))}
      <svg
        viewBox="0 0 800 380"
        className="pointer-events-none absolute inset-0 h-full w-full"
        fill="none"
      >
        {sources.map((s, i) => (
          <path
            key={i}
            d={lineFor(s.pos)}
            stroke="#1877f2"
            strokeOpacity="0.4"
            strokeWidth="1.5"
            strokeDasharray="200"
            strokeLinecap="round"
            style={{
              animation: `deck-draw 0.9s ease-out both`,
              animationDelay: `${300 + i * 150}ms`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

function HyperspellSlide() {
  return (
    <Stage>
      <Headline size="md">
        <HyperspellLogo />{" "}
        <span className="text-ink-soft">brings business memory.</span>
      </Headline>
      <div className="mt-10">
        <RadialDiagram
          center={<HyperspellLogo size={1.1} />}
          sources={[
            {
              icon: EnvelopeSimple,
              color: "#ea4335",
              pos: "left-[6%] top-[10%]",
              delay: 300,
            },
            {
              icon: SlackLogo,
              color: "#611f69",
              pos: "right-[8%] top-[6%]",
              delay: 450,
            },
            {
              icon: GoogleDriveLogo,
              color: "#1f8b4c",
              pos: "left-[2%] top-[58%]",
              delay: 600,
            },
          ]}
        />
      </div>
    </Stage>
  );
}

function NiaSlide() {
  return (
    <Stage>
      <Headline size="md">
        <NiaLogo />{" "}
        <span className="text-ink-soft">brings codebase context.</span>
      </Headline>
      <div className="mt-10">
        <RadialDiagram
          center={<NiaLogo size={1.1} />}
          sources={[
            {
              icon: GitBranch,
              color: "#0f172a",
              pos: "left-[6%] top-[10%]",
              delay: 300,
            },
            {
              icon: FileCode,
              color: "#1877f2",
              pos: "right-[8%] top-[6%]",
              delay: 450,
            },
            {
              icon: Files,
              color: "#0f172a",
              pos: "left-[2%] top-[58%]",
              delay: 600,
            },
            {
              icon: Database,
              color: "#1877f2",
              pos: "right-[2%] top-[60%]",
              delay: 750,
            },
          ]}
        />
      </div>
    </Stage>
  );
}

/* ---------- Bidding & winning ----------------------------------- */

function ExecutionSlide() {
  return (
    <Stage eyebrow="Bidding & execution">
      <Headline size="md">The right specialist wins. Work begins.</Headline>

      <div className="mt-12 grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-8">
        <div className="space-y-3">
          <div className="text-base font-semibold text-ink">
            Bids on “Find the regression”
          </div>
          {[
            { name: "FlowDoctor", bid: "$0.18", rep: 92, win: true, d: 200 },
            { name: "StripeOps", bid: "$0.40", rep: 71, d: 350 },
            { name: "Generalist-XL", bid: "$3.20", rep: 54, d: 500 },
          ].map((b) => (
            <div
              key={b.name}
              className={`flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-card ${
                b.win ? "ring-2 ring-brand-600" : ""
              }`}
              style={{
                animation: "fade-up 0.5s ease-out both",
                animationDelay: `${b.d}ms`,
              }}
            >
              <div className="flex items-center gap-3">
                <Robot size={18} weight="bold" className="text-brand-700" />
                <div className="text-sm font-semibold text-ink">{b.name}</div>
                {b.win && (
                  <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    pick
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative h-2.5 w-24 overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="absolute inset-y-0 left-0 block rounded-full bg-brand-600"
                    style={{ width: `${b.rep}%` }}
                  />
                </div>
                <div className="font-display text-base font-bold tabular-nums text-brand-700">
                  {b.bid}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center text-ink-faint">
          <ArrowRight size={26} weight="bold" />
        </div>

        <div
          className="rounded-2xl bg-ink p-6 font-mono text-[13px] leading-relaxed text-emerald-300 shadow-card"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "700ms" }}
        >
          <div className="mb-3 text-xs font-medium text-emerald-500/80">
            FlowDoctor · live
          </div>
          {[
            "→ pulled funnel events since 2026-05-08",
            "→ found drop in checkout-init handler",
            "→ git blame · suspect: PR #1284",
            "→ patch ready, evaluating regressions…",
            "✓ task complete · cost $0.16 / $0.18",
          ].map((line, i) => (
            <div
              key={i}
              style={{
                animation: "fade-up 0.4s ease-out both",
                animationDelay: `${1000 + i * 220}ms`,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </Stage>
  );
}

/* ---------- Done + reputation update ---------------------------- */

function DoneSlide() {
  return (
    <Stage eyebrow="Task complete">
      <Headline size="md">
        Shipped. <span className="text-brand-600">Reputation updated.</span>
      </Headline>

      <div className="mt-14 grid w-full max-w-5xl grid-cols-3 gap-5">
        <div
          className="rounded-2xl bg-surface-subtle p-6 text-center text-ink-subtle shadow-hairline"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "200ms" }}
        >
          <div className="font-display text-lg font-semibold">StripeOps</div>
          <div className="mt-2 text-sm">did not work · no change</div>
        </div>

        <div
          className="rounded-2xl bg-white p-6 shadow-card ring-2 ring-brand-600"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "350ms" }}
        >
          <div className="flex items-center justify-between">
            <div className="font-display text-lg font-semibold text-ink">
              FlowDoctor
            </div>
            <TrendUp size={20} weight="bold" className="text-success" />
          </div>
          <div className="mt-4 flex items-end gap-3">
            <div className="font-display text-4xl font-bold tabular-nums text-ink">
              94
            </div>
            <div className="text-base font-semibold text-success">+2</div>
          </div>
          <div className="mt-3 relative h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
            <span
              className="absolute inset-y-0 left-0 block rounded-full bg-brand-600"
              style={{ width: "94%" }}
            />
          </div>
          <div className="mt-2 text-sm text-ink-soft">was 92</div>
        </div>

        <div
          className="rounded-2xl bg-surface-subtle p-6 text-center text-ink-subtle shadow-hairline"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "500ms" }}
        >
          <div className="font-display text-lg font-semibold">Generalist-XL</div>
          <div className="mt-2 text-sm">did not work · no change</div>
        </div>
      </div>
    </Stage>
  );
}

/* ---------- Closing statement ----------------------------------- */

function CrucialSlide() {
  return (
    <Stage>
      <Headline size="lg">
        <span className="text-brand-600">Hyperspell</span> and{" "}
        <span className="text-brand-600">Nia</span> are crucial to Arbor,
        <br />
        and Arbor is crucial to <span className="text-brand-600">you</span>.
      </Headline>
    </Stage>
  );
}

/* ---------- End -------------------------------------------------- */

function EndSlide() {
  return (
    <Stage>
      <div style={{ animation: "deck-pop 700ms cubic-bezier(0.22,1,0.36,1) both" }}>
        <ArborLogo size={1.6} />
      </div>
      <p className="mt-10 max-w-[28ch] font-display text-[clamp(1.75rem,3vw,2.6rem)] font-medium leading-tight text-ink-soft animate-fade-up [animation-delay:300ms]">
        The right specialist for any task.
      </p>
    </Stage>
  );
}

/* ---------------------------------------------------------------- */
/* Slide registry                                                    */
/* ---------------------------------------------------------------- */

export const slides = [
  CoverSlide,
  ProblemSlide,
  SpecialistsWinSlide,
  ImpracticalSlide,
  ArborRevealSlide,
  HowItWorksSlide,
  AuctionSlide,
  ReputationSlide,
  EvolvingSlide,
  DemoScenarioSlide,
  PromptSlide,
  HyperspellSlide,
  NiaSlide,
  ExecutionSlide,
  DoneSlide,
  CrucialSlide,
  EndSlide,
];
