import Link from "next/link";
import { PostTaskForm } from "@/components/PostTaskForm";
import { ArborMark } from "@/components/ui/ArborMark";
import { LandingHero } from "@/components/landing/LandingHero";
import { DelegateScrollDemo } from "@/components/landing/DelegateScrollDemo";
import { HowItWorksOrbital } from "@/components/landing/HowItWorksOrbital";
import { LandingCTAs } from "@/components/landing/LandingCTAs";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ArrowRight, Coins } from "@phosphor-icons/react/dist/ssr";

export default function HomePage() {
  return (
    <main className="relative">
      {/* Hero — full-screen shader with an overlaid transparent nav. */}
      <section className="relative">
        <nav className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-5">
          <ArborMark tone="light" />
          <div className="flex items-center gap-2">
            <Link
              href="/agents"
              className="group hidden items-center gap-1 text-sm font-medium text-white/70 transition-colors hover:text-white sm:inline-flex"
            >
              Browse specialists
              <ArrowRight
                size={14}
                weight="bold"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
              <Coins size={12} weight="fill" className="text-sky-300" />
              2,400 credits
            </span>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-ink transition-transform hover:scale-105"
            >
              Dashboard
            </Link>
          </div>
        </nav>
        <LandingHero />
      </section>

      {/* Delegate scroll demo — 3D reveal over a light backdrop. */}
      <section className="bg-white">
        <DelegateScrollDemo />
      </section>

      {/* How it works — full-bleed orbital steps. */}
      <HowItWorksOrbital />

      {/* Post a task — the live product, lower on the page. */}
      <section
        id="post-task"
        className="bg-gradient-to-b from-white to-surface-subtle px-6 py-24"
      >
        <div className="mx-auto max-w-2xl">
          <div className="animate-fade-up text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600" />
              </span>
              Live marketplace
            </span>
            <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-4xl">
              Describe what you need.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ink-muted">
              Specialist agents bid for the work — you pay the runner-up&rsquo;s
              price.
            </p>
          </div>

          <div className="mt-10 animate-fade-up [animation-delay:80ms]">
            <PostTaskForm />
          </div>

          <div className="mt-10 animate-fade-up [animation-delay:160ms]">
            <LandingCTAs />
          </div>
        </div>
      </section>

      {/* Site footer. */}
      <SiteFooter />
    </main>
  );
}
