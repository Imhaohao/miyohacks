import type { CSSProperties, ReactNode } from "react";
import { Tree } from "@phosphor-icons/react/dist/ssr";
import {
  ArrowRight,
  EnvelopeSimple,
  FileCode,
  GitBranch,
  Files,
  Database,
  Robot,
  Sparkle,
  TrendDown,
  TrendUp,
  Trophy,
} from "@phosphor-icons/react";

/* External brand logos. The sandbox can't fetch these but the user's
 * browser can. If they ever break, drop replacements into /public/logos
 * and swap the URLs. */
const LOGOS = {
  hyperspell:
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpd-LWIVew2l64OKrrrE9J6jMJg_Rz1Bo1Tg&s",
  gdrive:
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3cPiiBjAeOParQoWl8fOkW7C_ymO6IWjIYg&s",
  slack:
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQK72M84jyOoaT2cb2QcJv8L1O8TTeMjBUYGA&s",
  gmail:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/1280px-Gmail_icon_%282020%29.svg.png",
  nia: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTo9Lot-_eyPvt9yhu_zi1FAOEKP0E4cn-txA&s",
} as const;

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGOS.hyperspell}
        alt="Hyperspell"
        width={56 * size}
        height={56 * size}
        className="rounded-2xl object-contain shadow-card"
      />
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGOS.nia}
        alt="Nia"
        width={56 * size}
        height={56 * size}
        className="rounded-2xl object-contain shadow-card"
      />
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

/* ---------- How-it-works hand-drawn diagram --------------------- */

function HowItWorksSlide() {
  // Stagger fade-ins down the page so the diagram “draws itself”.
  const layer = (delay: number) => ({
    style: {
      animation: "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
      animationDelay: `${delay}ms`,
    } as const,
  });
  return (
    <Stage>
      <div className="font-handdrawn relative flex h-full max-h-[88vh] w-full items-center justify-center">
        <svg
          viewBox="0 0 800 940"
          className="h-full w-auto max-w-full"
          fill="none"
        >
          <defs>
            {(["ink", "grey", "blue", "green"] as const).map((k) => {
              const color = {
                ink: "#0f172a",
                grey: "#94a3b8",
                blue: "#1877f2",
                green: "#10b981",
              }[k];
              return (
                <marker
                  key={k}
                  id={`arr-${k}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                </marker>
              );
            })}
          </defs>

          {/* User Query */}
          <g {...layer(0)}>
            <rect
              x="20"
              y="20"
              width="280"
              height="100"
              rx="22"
              fill="white"
              stroke="#0f172a"
              strokeWidth="2.5"
            />
            <text
              x="160"
              y="83"
              textAnchor="middle"
              fontSize="36"
              fontWeight={500}
              fill="#0f172a"
            >
              User Query
            </text>
          </g>

          {/* Curved arrow → subtask */}
          <g {...layer(250)}>
            <path
              d="M 160 122 C 170 200, 380 195, 400 230"
              stroke="#0f172a"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#arr-ink)"
            />
          </g>

          {/* subtask: design page */}
          <g {...layer(450)}>
            <rect
              x="160"
              y="240"
              width="480"
              height="100"
              rx="22"
              fill="white"
              stroke="#0f172a"
              strokeWidth="2.5"
            />
            <text
              x="400"
              y="303"
              textAnchor="middle"
              fontSize="34"
              fontWeight={500}
              fill="#0f172a"
            >
              subtask: design page
            </text>
          </g>

          {/* Splitting arrows */}
          <g {...layer(700)}>
            <path
              d="M 320 342 C 250 400, 150 410, 130 470"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#arr-grey)"
            />
            <path
              d="M 400 342 L 400 470"
              stroke="#0f172a"
              strokeWidth="2.5"
              strokeLinecap="round"
              markerEnd="url(#arr-ink)"
            />
            <path
              d="M 480 342 C 550 400, 600 410, 600 470"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#arr-grey)"
            />
            <path
              d="M 580 340 C 670 400, 750 430, 760 470"
              stroke="#cbd5e1"
              strokeWidth="2"
              strokeDasharray="6 7"
              strokeLinecap="round"
              markerEnd="url(#arr-grey)"
            />
          </g>

          {/* Specialists row */}
          <g {...layer(900)}>
            <rect
              x="40"
              y="480"
              width="180"
              height="90"
              rx="20"
              fill="white"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            <text
              x="130"
              y="535"
              textAnchor="middle"
              fontSize="30"
              fontWeight={500}
              fill="#94a3b8"
            >
              Stripe
            </text>

            <rect
              x="310"
              y="480"
              width="180"
              height="90"
              rx="20"
              fill="white"
              stroke="#1877f2"
              strokeWidth="2.5"
            />
            <text
              x="400"
              y="535"
              textAnchor="middle"
              fontSize="30"
              fontWeight={500}
              fill="#1877f2"
            >
              v0.dev
            </text>

            <rect
              x="510"
              y="480"
              width="180"
              height="90"
              rx="20"
              fill="white"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            <text
              x="600"
              y="535"
              textAnchor="middle"
              fontSize="30"
              fontWeight={500}
              fill="#94a3b8"
            >
              codex
            </text>

            <text
              x="745"
              y="540"
              textAnchor="middle"
              fontSize="40"
              fill="#cbd5e1"
            >
              …
            </text>
          </g>

          {/* Select best arrow */}
          <g {...layer(1100)}>
            <path
              d="M 400 580 L 400 690"
              stroke="#1877f2"
              strokeWidth="2.5"
              strokeLinecap="round"
              markerEnd="url(#arr-blue)"
            />
            <text x="305" y="640" fontSize="28" fontWeight={500} fill="#1877f2">
              Select best
            </text>
          </g>

          {/* Hyperspell & Nia context */}
          <g {...layer(1300)}>
            <rect
              x="80"
              y="700"
              width="640"
              height="100"
              rx="22"
              fill="white"
              stroke="#0f172a"
              strokeWidth="2.5"
            />
            <text
              x="400"
              y="763"
              textAnchor="middle"
              fontSize="34"
              fontWeight={500}
              fill="#0f172a"
            >
              Hyperspell &amp; Nia context
            </text>
          </g>

          {/* Green tail arrow */}
          <g {...layer(1500)}>
            <path
              d="M 400 800 L 400 870"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              markerEnd="url(#arr-green)"
            />
          </g>

          {/* Final celebration line */}
          <g {...layer(1700)}>
            <text
              x="400"
              y="920"
              textAnchor="middle"
              fontSize="34"
              fontWeight={700}
              fill="#10b981"
            >
              HAPPY HAPPY HAPPY HAPPY HAPPY TASK DONE!!
            </text>
          </g>
        </svg>
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

function SourceChip({
  delay,
  className = "",
  style,
  children,
}: {
  delay: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute inline-flex items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-card ${className}`}
      style={{
        width: 84,
        height: 84,
        animation: "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: `${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ChipIcon({
  icon: Icon,
  color,
  size = 36,
}: {
  icon: typeof Sparkle;
  color: string;
  size?: number;
}) {
  return <Icon size={size} weight="fill" style={{ color }} />;
}

function ChipImg({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={56}
      height={56}
      className="h-14 w-14 object-contain"
    />
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

type RadialSource = {
  angle: number;
  delay: number;
  content: ReactNode;
};

function RadialDiagram({
  center,
  sources,
}: {
  center: ReactNode;
  sources: RadialSource[];
}) {
  const W = 720;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 270;
  const ry = 130;
  const innerRx = 110;
  const innerRy = 75;
  const chip = 84;

  const positions = sources.map((s) => {
    const a = (s.angle * Math.PI) / 180;
    return {
      x: cx + rx * Math.cos(a),
      y: cy + ry * Math.sin(a),
      ix: cx + innerRx * Math.cos(a),
      iy: cy + innerRy * Math.sin(a),
    };
  });

  return (
    <div className="relative mx-auto" style={{ width: W, height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        fill="none"
      >
        {positions.map((p, i) => (
          <path
            key={i}
            d={`M${p.x} ${p.y} L ${p.ix} ${p.iy}`}
            stroke="#1877f2"
            strokeOpacity="0.4"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{
              animation: `deck-draw 0.9s ease-out both`,
              animationDelay: `${300 + i * 150}ms`,
            }}
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {center}
      </div>
      {sources.map((s, i) => (
        <SourceChip
          key={i}
          delay={s.delay}
          style={{ left: positions[i].x - chip / 2, top: positions[i].y - chip / 2 }}
        >
          {s.content}
        </SourceChip>
      ))}
    </div>
  );
}

function HyperspellSlide() {
  return (
    <Stage>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 font-display text-[clamp(1.75rem,3.5vw,3rem)] font-semibold leading-[1.1] tracking-tight text-ink">
        <HyperspellLogo />
        <span className="text-ink-soft">brings business memory.</span>
      </div>
      <div className="mt-10">
        <RadialDiagram
          center={<HyperspellLogo size={1.1} />}
          sources={[
            {
              angle: 215,
              delay: 300,
              content: <ChipImg src={LOGOS.gmail} alt="Gmail" />,
            },
            {
              angle: 325,
              delay: 450,
              content: <ChipImg src={LOGOS.slack} alt="Slack" />,
            },
            {
              angle: 90,
              delay: 600,
              content: <ChipImg src={LOGOS.gdrive} alt="Google Drive" />,
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
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 font-display text-[clamp(1.75rem,3.5vw,3rem)] font-semibold leading-[1.1] tracking-tight text-ink">
        <NiaLogo />
        <span className="text-ink-soft">brings codebase context.</span>
      </div>
      <div className="mt-10">
        <RadialDiagram
          center={<NiaLogo size={1.1} />}
          sources={[
            {
              angle: 215,
              delay: 300,
              content: <ChipIcon icon={GitBranch} color="#0f172a" />,
            },
            {
              angle: 325,
              delay: 450,
              content: <ChipIcon icon={FileCode} color="#1877f2" />,
            },
            {
              angle: 145,
              delay: 600,
              content: <ChipIcon icon={Files} color="#0f172a" />,
            },
            {
              angle: 35,
              delay: 750,
              content: <ChipIcon icon={Database} color="#1877f2" />,
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
