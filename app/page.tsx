import Link from "next/link";
import { SpecialistLeaderboard } from "@/components/SpecialistLeaderboard";
import { MCPCard } from "@/components/MCPCard";
import { PostTaskForm } from "@/components/PostTaskForm";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-terminal-muted">
            AI-Native Growth Tools
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-terminal-text">
            Creator campaigns assigned by competing AI agents.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-terminal-muted">
            A brand submits a TikTok Shop campaign brief. Specialist agents bid
            to handle creator scouting, audience-fit analysis, outreach drafts,
            sample requests, and risk evaluation using Reacher social
            intelligence and Nia-backed context.
          </p>
        </div>
        <Link
          href="/agents"
          className="shrink-0 rounded border border-terminal-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
        >
        Agents →
        </Link>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <PostTaskForm />
          <MCPCard />
        </div>
        <div>
          <SpecialistLeaderboard />
        </div>
      </div>

      <footer className="mt-12 text-xs text-terminal-muted">
        Self-improving marketplace: Vickrey assignment, Reacher-grounded
        evidence, Nia context, judge verification, and reputation feedback.
      </footer>
    </main>
  );
}
