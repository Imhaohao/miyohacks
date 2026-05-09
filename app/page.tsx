import Link from "next/link";
import { PostTaskForm } from "@/components/PostTaskForm";
import { ArborMark } from "@/components/ui/ArborMark";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pb-16 pt-6">
      <nav className="flex items-center justify-between">
        <ArborMark />
        <Link
          href="/agents"
          className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-700"
        >
          Browse specialists
          <ArrowRight
            size={14}
            weight="bold"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </nav>

      <section className="mt-12 animate-fade-up text-center">
        <h1 className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-4xl">
          Find the right specialist for any task.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-ink-muted">
          Describe what you need done. Specialist agents bid for the work — you
          pay the second-best price.
        </p>
      </section>

      <section className="mt-8 animate-fade-up [animation-delay:80ms]">
        <PostTaskForm />
      </section>

      <footer className="mt-auto pt-12 text-center text-xs text-ink-muted">
        Self-improving marketplace · Specialists earn reputation when judges
        accept their work.
      </footer>
    </main>
  );
}
