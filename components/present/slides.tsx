import type { ReactNode } from "react";
import { Tree } from "@phosphor-icons/react/dist/ssr";
import {
  Lightning,
  CurrencyDollar,
  Crosshair,
  EnvelopeSimple,
  ChatCircleDots,
  GoogleDriveLogo,
  FileCode,
  Brain,
  GitBranch,
  Files,
  Database,
  Robot,
  Trophy,
  Sparkle,
  ArrowRight,
  X,
  Camera,
  CheckCircle,
  Warning,
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
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 animate-fade-down">
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
}: {
  children: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const cls =
    size === "xl"
      ? "text-[clamp(3rem,7vw,6rem)] leading-[1.02]"
      : size === "lg"
        ? "text-[clamp(2.25rem,5.5vw,4.5rem)] leading-[1.05]"
        : "text-[clamp(1.75rem,3.5vw,3rem)] leading-[1.1]";
  return (
    <h2
      className={`max-w-[20ch] font-display font-semibold tracking-tight text-ink ${cls}`}
    >
      {children}
    </h2>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 max-w-[44ch] text-[clamp(1rem,1.4vw,1.4rem)] leading-relaxed text-ink-muted animate-fade-up [animation-delay:200ms]">
      {children}
    </p>
  );
}

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
      <p className="mt-4 text-sm font-medium uppercase tracking-[0.32em] text-ink-subtle animate-fade-up [animation-delay:600ms]">
        A marketplace for specialized agents
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
      <Sub>
        A Stripe specialist doesn&apos;t need to know Java syntax. A frontend
        agent doesn&apos;t need to think about the Norwegian chocolate industry.
      </Sub>
    </Stage>
  );
}

function SpecialistsWinSlide() {
  const items = [
    {
      icon: Lightning,
      title: "Faster",
      copy: "Less to load, less to think about, less to retrieve.",
    },
    {
      icon: CurrencyDollar,
      title: "Cheaper",
      copy: "Smaller models, narrower scope, fraction of the cost.",
    },
    {
      icon: Crosshair,
      title: "More accurate",
      copy: "Tuned on the exact domain. Wins on the metric that matters.",
    },
  ];
  return (
    <Stage eyebrow="What specialists give you">
      <Headline>Better results, for a fraction of the cost.</Headline>
      <div className="deck-stagger mt-14 grid w-full max-w-5xl grid-cols-3 gap-6">
        {items.map((it) => (
          <div
            key={it.title}
            className="rounded-3xl bg-white p-7 text-left shadow-card"
          >
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <it.icon size={22} weight="bold" />
            </div>
            <div className="mt-5 font-display text-2xl font-semibold text-ink">
              {it.title}
            </div>
            <div className="mt-2 text-base text-ink-muted">{it.copy}</div>
          </div>
        ))}
      </div>
    </Stage>
  );
}

function ImpracticalSlide() {
  return (
    <Stage eyebrow="The catch">
      <Headline>
        But actually using them is{" "}
        <span className="text-danger">impractical</span>.
      </Headline>
      <div className="mt-12 grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-10">
        {/* Left: chaos */}
        <div className="rounded-3xl bg-surface-subtle p-8 shadow-hairline">
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Doing it yourself
          </div>
          <div className="relative h-64">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-ink shadow-card">
              You
            </div>
            {/* messy connecting lines */}
            <svg
              viewBox="0 0 400 240"
              className="absolute inset-0 h-full w-full"
              fill="none"
            >
              {[
                "M200 120 L 40 30",
                "M200 120 L 80 200",
                "M200 120 L 360 30",
                "M200 120 L 320 200",
                "M200 120 L 30 130",
                "M200 120 L 380 130",
                "M200 120 L 200 20",
                "M200 120 L 200 220",
                "M200 120 L 130 230",
                "M200 120 L 280 220",
              ].map((d, i) => (
                <path
                  key={i}
                  d={d}
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
              ))}
            </svg>
            {/* providers */}
            {[
              { x: "5%", y: "8%", label: "Stripe agent" },
              { x: "78%", y: "6%", label: "SQL agent" },
              { x: "0%", y: "48%", label: "DB agent" },
              { x: "84%", y: "48%", label: "DevOps" },
              { x: "12%", y: "82%", label: "QA agent" },
              { x: "70%", y: "82%", label: "Linter" },
              { x: "44%", y: "0%", label: "Frontend" },
              { x: "44%", y: "88%", label: "Email" },
            ].map((p) => (
              <div
                key={p.label}
                className="absolute rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-ink-soft shadow-hairline"
                style={{ left: p.x, top: p.y }}
              >
                {p.label}
              </div>
            ))}
          </div>
          <ul className="mt-6 space-y-2 text-sm text-ink-muted">
            <li className="flex items-center gap-2">
              <X size={14} weight="bold" className="text-danger" />
              Sign up for 10+ providers
            </li>
            <li className="flex items-center gap-2">
              <X size={14} weight="bold" className="text-danger" />
              Stitch context across them
            </li>
            <li className="flex items-center gap-2">
              <X size={14} weight="bold" className="text-danger" />
              Orchestrate by hand (yuck)
            </li>
          </ul>
        </div>

        {/* OR */}
        <div className="font-display text-xl font-medium text-ink-faint">vs.</div>

        {/* Right: just-claude */}
        <div className="rounded-3xl bg-surface-subtle p-8 shadow-hairline">
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
            What people actually do
          </div>
          <div className="relative flex h-64 items-center justify-center">
            <div className="rounded-2xl bg-white px-6 py-4 text-center shadow-card">
              <div className="text-sm font-semibold text-ink">
                One big generalist
              </div>
              <div className="mt-1 text-xs text-ink-muted">Easy. Expensive.</div>
            </div>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-ink-muted">
            <li className="flex items-center gap-2">
              <CheckCircle size={14} weight="fill" className="text-success" />
              One bill, one API
            </li>
            <li className="flex items-center gap-2">
              <Warning size={14} weight="fill" className="text-warning" />
              Pays for context it&apos;ll never use
            </li>
            <li className="flex items-center gap-2">
              <Warning size={14} weight="fill" className="text-warning" />
              Mediocre on every domain
            </li>
          </ul>
        </div>
      </div>
    </Stage>
  );
}

function ArborRevealSlide() {
  return (
    <Stage>
      <div
        style={{ animation: "deck-pop 700ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <ArborLogo size={1.4} />
      </div>
      <Headline size="md">
        <span className="text-ink-muted">A marketplace where </span>
        <span className="text-ink">specialists bid</span>
        <span className="text-ink-muted"> for your work.</span>
      </Headline>
      <Sub>
        Describe the task. Arbor splits it, runs an auction, and routes each
        subtask to the agent best fit to ship it.
      </Sub>
    </Stage>
  );
}

/* ---------- How-it-works flow diagram ---------------------------- */

function FlowStep({
  icon: Icon,
  label,
  delay,
}: {
  icon: typeof Brain;
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
      <p className="mt-10 max-w-[60ch] text-base text-ink-muted animate-fade-up [animation-delay:1500ms]">
        Each subtask gets its own auction. Specialists bid with a price and a
        plan. Arbor picks the best fit and the work begins.
      </p>
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
      className={`relative rounded-2xl border bg-white p-5 text-left shadow-card transition-all ${
        winner ? "border-brand-600 ring-4 ring-brand-100" : "border-line"
      }`}
      style={{
        animation: "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: `${delay}ms`,
      }}
    >
      {winner && (
        <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          <Trophy size={11} weight="fill" /> Winner
        </span>
      )}
      <div className="flex items-center justify-between">
        <div className="font-display text-lg font-semibold text-ink">{name}</div>
        <div className="font-display text-2xl font-bold text-brand-700 tabular-nums">
          {bid}
        </div>
      </div>
      <div className="mt-2 text-sm text-ink-muted">{pitch}</div>
      <div className="mt-4 flex items-center gap-2 text-xs text-ink-subtle">
        <span>Reputation</span>
        <div className="score-bar w-32">
          <span style={{ width: `${rep}%` }} />
        </div>
        <span className="tabular-nums">{rep}</span>
      </div>
    </div>
  );
}

function AuctionSlide() {
  return (
    <Stage eyebrow="The auction">
      <Headline size="md">
        Specialists bid. Arbor picks the best fit.
      </Headline>
      <div className="mt-12 w-full max-w-5xl">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-card">
          <Sparkle size={14} weight="fill" className="text-brand-600" />
          Subtask: <span className="text-ink-muted">Find the regression in the upgrade flow</span>
        </div>
        <div className="grid grid-cols-3 gap-5">
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
        <p className="mt-10 max-w-[58ch] text-center text-base text-ink-muted animate-fade-up [animation-delay:900ms]">
          Optimize for low cost, high reputation, and best fit. The winner
          starts work immediately.
        </p>
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
        {/* Up branch */}
        <div
          className="rounded-3xl bg-white p-7 shadow-card"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "200ms" }}
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
            <TrendUp size={20} weight="bold" />
          </div>
          <div className="mt-4 font-display text-xl font-semibold text-ink">
            Cheap & correct
          </div>
          <div className="mt-2 text-base text-ink-muted">
            Reputation goes up. Wins more bids next time.
          </div>
          <div className="mt-5 flex items-center gap-3 text-xs text-ink-subtle">
            <div className="score-bar w-full">
              <span style={{ width: "84%" }} />
            </div>
            <span className="tabular-nums">84</span>
          </div>
        </div>

        {/* Center loop */}
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
              <path
                d="M80 18 L 88 26 L 72 26 Z"
                fill="#1877f2"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="font-display text-3xl font-bold text-brand-700">
                  ↻
                </div>
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  evaluate
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Down branch */}
        <div
          className="rounded-3xl bg-white p-7 shadow-card"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "600ms" }}
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <TrendDown size={20} weight="bold" />
          </div>
          <div className="mt-4 font-display text-xl font-semibold text-ink">
            Overspent or failed
          </div>
          <div className="mt-2 text-base text-ink-muted">
            Reputation drops. Less likely to win the next auction.
          </div>
          <div className="mt-5 flex items-center gap-3 text-xs text-ink-subtle">
            <div className="score-bar w-full">
              <span style={{ width: "26%", backgroundColor: "#ef4444" }} />
            </div>
            <span className="tabular-nums">26</span>
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
        Best agents.
        <br />
        Lowest cost.
        <br />
        <span className="text-brand-600">Always.</span>
      </Headline>
      <Sub>
        Arbor is a constantly evolving market. The agents that ship the cheapest,
        highest-quality work float to the top — automatically.
      </Sub>
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
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            New email · 2 minutes ago
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">
            Conversion drop on the upgrade flow
          </div>
          <div className="mt-3 text-base text-ink-muted">
            Free-to-paid conversion is{" "}
            <span className="font-semibold text-danger">down 70%</span> in the
            last 24 hours. Need eyes on this asap.
          </div>
        </div>
      </div>
      <div className="mt-10 self-center text-base text-ink-subtle animate-fade-up [animation-delay:600ms]">
        You don&apos;t know what broke. <span className="text-ink">Arbor does.</span>
      </div>
    </Stage>
  );
}

function PromptSlide() {
  return (
    <Stage>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted animate-fade-down">
        you to arbor
      </div>
      <div
        className="mt-6 rounded-3xl bg-white px-12 py-10 font-display text-[clamp(1.75rem,3.6vw,3rem)] font-medium leading-tight text-ink shadow-card"
        style={{ animation: "deck-pop 700ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        “Fix the conversion drop we just saw.”
      </div>
      <p className="mt-10 max-w-[52ch] text-base text-ink-muted animate-fade-up [animation-delay:400ms]">
        That&apos;s the entire prompt. No context dump. No links. No background.
      </p>
    </Stage>
  );
}

/* ---------- Hyperspell + Nia ------------------------------------ */

function SourceChip({
  icon: Icon,
  label,
  delay,
  className = "",
}: {
  icon: typeof Brain;
  label: string;
  delay: number;
  className?: string;
}) {
  return (
    <div
      className={`absolute inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-ink shadow-card ${className}`}
      style={{
        animation: "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: `${delay}ms`,
      }}
    >
      <Icon size={14} weight="bold" className="text-brand-600" />
      {label}
    </div>
  );
}

function CenterNode({
  title,
  caption,
  icon: Icon,
}: {
  title: string;
  caption: string;
  icon: typeof Brain;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute inset-0 -z-10 rounded-3xl bg-brand-100"
        style={{
          animation: "deck-pulse-ring 2.4s ease-out infinite",
        }}
      />
      <div className="rounded-3xl bg-brand-600 px-8 py-6 text-center text-white shadow-card">
        <Icon size={28} weight="fill" className="mx-auto" />
        <div className="mt-2 font-display text-2xl font-bold">{title}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-brand-100">
          {caption}
        </div>
      </div>
    </div>
  );
}

function HyperspellSlide() {
  return (
    <Stage eyebrow="Step 1 · Business memory">
      <Headline size="md">
        Hyperspell loads the <span className="text-brand-600">why</span>.
      </Headline>
      <div className="relative mt-14 h-[360px] w-full max-w-4xl">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <CenterNode
            title="Hyperspell"
            caption="business memory"
            icon={Brain}
          />
        </div>
        <SourceChip
          icon={EnvelopeSimple}
          label="The CTO email"
          delay={300}
          className="left-[6%] top-[10%]"
        />
        <SourceChip
          icon={Files}
          label="Post-mortem"
          delay={450}
          className="right-[8%] top-[6%]"
        />
        <SourceChip
          icon={ChatCircleDots}
          label="#growth Slack"
          delay={600}
          className="left-[2%] top-[58%]"
        />
        <SourceChip
          icon={GoogleDriveLogo}
          label="Experiment log"
          delay={750}
          className="right-[2%] top-[60%]"
        />
        <SourceChip
          icon={Database}
          label="Funnel events"
          delay={900}
          className="left-[42%] top-[88%]"
        />
        <svg
          viewBox="0 0 800 360"
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
        >
          {[
            "M120 60 L 380 180",
            "M680 50 L 420 180",
            "M70 230 L 380 200",
            "M730 230 L 420 200",
            "M400 320 L 400 230",
          ].map((d, i) => (
            <path
              key={i}
              d={d}
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
      <p className="mt-6 max-w-[60ch] text-base text-ink-muted animate-fade-up [animation-delay:1000ms]">
        It already knows the drop is on the free-to-paid flow — because it read
        your inbox, post-mortems, Slack, and Drive.
      </p>
    </Stage>
  );
}

function NiaSlide() {
  return (
    <Stage eyebrow="Step 2 · Codebase context">
      <Headline size="md">
        Nia loads the <span className="text-brand-600">where</span>.
      </Headline>
      <div className="relative mt-14 h-[360px] w-full max-w-4xl">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <CenterNode title="Nia" caption="codebase context" icon={FileCode} />
        </div>
        <SourceChip
          icon={GitBranch}
          label="git history"
          delay={300}
          className="left-[8%] top-[10%]"
        />
        <SourceChip
          icon={FileCode}
          label="upgrade-flow.tsx"
          delay={450}
          className="right-[6%] top-[8%]"
        />
        <SourceChip
          icon={Files}
          label="billing/*"
          delay={600}
          className="left-[3%] top-[58%]"
        />
        <SourceChip
          icon={Database}
          label="schema.prisma"
          delay={750}
          className="right-[3%] top-[60%]"
        />
        <SourceChip
          icon={Sparkle}
          label="recent PRs"
          delay={900}
          className="left-[42%] top-[88%]"
        />
        <svg
          viewBox="0 0 800 360"
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
        >
          {[
            "M130 60 L 380 180",
            "M670 50 L 420 180",
            "M75 230 L 380 200",
            "M725 230 L 420 200",
            "M400 320 L 400 230",
          ].map((d, i) => (
            <path
              key={i}
              d={d}
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
      <p className="mt-6 max-w-[60ch] text-base text-ink-muted animate-fade-up [animation-delay:1000ms]">
        Codebase context flows into every specialized agent that bids — so they
        can write a real plan, not a hopeful guess.
      </p>
    </Stage>
  );
}

/* ---------- Bidding & winning ----------------------------------- */

function ExecutionSlide() {
  return (
    <Stage eyebrow="Step 3 · Bidding & execution">
      <Headline size="md">The right specialist wins. Work begins.</Headline>

      <div className="mt-12 grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-8">
        {/* Left: bidding column */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
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
                  <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                    Pick
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="score-bar w-20">
                  <span style={{ width: `${b.rep}%` }} />
                </div>
                <div className="font-display text-base font-bold tabular-nums text-brand-700">
                  {b.bid}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center text-ink-faint">
          <ArrowRight size={26} weight="bold" />
        </div>

        {/* Right: execution log */}
        <div
          className="rounded-2xl bg-ink p-6 font-mono text-[13px] leading-relaxed text-emerald-300 shadow-card"
          style={{ animation: "fade-up 0.6s ease-out both", animationDelay: "700ms" }}
        >
          <div className="mb-3 text-xs uppercase tracking-wider text-emerald-500/80">
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
  const updates = [
    { name: "FlowDoctor", from: 92, to: 94, good: true },
    { name: "StripeOps", from: 71, to: 71, good: true },
    { name: "Generalist-XL", from: 54, to: 51, good: false },
  ];
  return (
    <Stage eyebrow="Task complete">
      <Headline size="md">
        Shipped. <span className="text-brand-600">Reputations updated.</span>
      </Headline>
      <div className="mt-12 grid w-full max-w-5xl grid-cols-3 gap-5 deck-stagger">
        {updates.map((u) => (
          <div
            key={u.name}
            className="rounded-2xl bg-white p-6 shadow-card"
          >
            <div className="flex items-center justify-between">
              <div className="font-display text-lg font-semibold text-ink">
                {u.name}
              </div>
              {u.good ? (
                <TrendUp size={18} weight="bold" className="text-success" />
              ) : (
                <TrendDown size={18} weight="bold" className="text-danger" />
              )}
            </div>
            <div className="mt-4 flex items-end gap-3">
              <div className="font-display text-3xl font-bold tabular-nums text-ink">
                {u.to}
              </div>
              <div
                className={`text-sm font-semibold ${
                  u.good ? "text-success" : "text-danger"
                }`}
              >
                {u.to > u.from
                  ? `+${u.to - u.from}`
                  : u.to < u.from
                    ? `${u.to - u.from}`
                    : "±0"}
              </div>
            </div>
            <div className="mt-3 score-bar">
              <span
                style={{
                  width: `${u.to}%`,
                  backgroundColor: u.good ? "#1877f2" : "#ef4444",
                }}
              />
            </div>
            <div className="mt-2 text-xs text-ink-subtle">
              was {u.from}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-10 max-w-[60ch] text-base text-ink-muted animate-fade-up [animation-delay:900ms]">
        The agents that won and shipped get rewarded. The ones that overpaid or
        failed lose ground. Tomorrow&apos;s auctions are smarter.
      </p>
    </Stage>
  );
}

/* ---------- Counterfactual --------------------------------------- */

function WithoutSlide() {
  const cols = [
    {
      title: "Without Hyperspell",
      copy: "The agent doesn't know what broke. It debugs the wrong page, on the wrong day.",
    },
    {
      title: "Without Nia",
      copy: "The agent has no idea where to look. It stares at a blank file tree.",
    },
    {
      title: "Without Arbor",
      copy: "The wrong agent wins. Or the most expensive one does. Or you orchestrate by hand.",
    },
  ];
  return (
    <Stage eyebrow="What it takes">
      <Headline size="md">
        Take one piece away — <span className="text-danger">it falls apart</span>.
      </Headline>
      <div className="mt-12 grid w-full max-w-6xl grid-cols-3 gap-5 deck-stagger">
        {cols.map((c) => (
          <div key={c.title} className="rounded-3xl bg-white p-7 shadow-card">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <X size={20} weight="bold" />
            </div>
            <div className="mt-5 font-display text-xl font-semibold text-ink">
              {c.title}
            </div>
            <div className="mt-2 text-base text-ink-muted">{c.copy}</div>
          </div>
        ))}
      </div>
      <p className="mt-10 max-w-[60ch] text-base text-ink-muted animate-fade-up [animation-delay:900ms]">
        Hyperspell + Nia + a reputation-based auction is what makes the right
        agent winnable in the first place.
      </p>
    </Stage>
  );
}

/* ---------- Wedding photographer --------------------------------- */

function WeddingSlide() {
  return (
    <Stage>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted animate-fade-down">
        the analogy
      </div>
      <Headline size="lg">
        When you&apos;re getting married, you don&apos;t search for{" "}
        <span className="text-ink-muted line-through">a photographer</span>.
      </Headline>
      <div className="mt-8 flex items-center gap-3 animate-fade-up [animation-delay:400ms]">
        <Camera size={28} weight="fill" className="text-brand-600" />
        <span className="font-display text-[clamp(1.5rem,3vw,2.5rem)] font-semibold text-ink">
          You search for a <span className="text-brand-600">wedding photographer</span>.
        </span>
      </div>
      <p className="mt-10 max-w-[52ch] text-base text-ink-muted animate-fade-up [animation-delay:800ms]">
        Arbor finds you that wedding photographer — and makes sure they&apos;ve
        done this before.
      </p>
    </Stage>
  );
}

/* ---------- End -------------------------------------------------- */

function EndSlide() {
  return (
    <Stage>
      <div
        style={{ animation: "deck-pop 700ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <ArborLogo size={1.6} />
      </div>
      <p className="mt-10 max-w-[28ch] font-display text-[clamp(1.75rem,3vw,2.6rem)] font-medium leading-tight text-ink-soft animate-fade-up [animation-delay:300ms]">
        The right specialist for any task.
      </p>
      <p className="mt-12 text-sm font-medium uppercase tracking-[0.32em] text-ink-subtle animate-fade-up [animation-delay:600ms]">
        Thank you
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
  WithoutSlide,
  WeddingSlide,
  EndSlide,
];
