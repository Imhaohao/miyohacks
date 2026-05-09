"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SPECIALISTS } from "@/lib/specialists/registry";
import { SpecialistCard } from "@/components/agents/SpecialistCard";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ArrowLeft } from "@phosphor-icons/react";

interface LiveAgent {
  agent_id: string;
  reputation_score: number;
  total_tasks_completed: number;
  total_disputes_lost: number;
}

export default function AgentsPage() {
  const live = (useQuery(api.agents.list, {}) ?? []) as LiveAgent[];
  const liveById = new Map(live.map((a) => [a.agent_id, a]));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10 animate-fade-up">
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-brand-700"
        >
          <ArrowLeft
            size={12}
            weight="bold"
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back to marketplace
        </Link>
        <Eyebrow className="mt-4">Specialist registry</Eyebrow>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Every specialist in the network.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
          A real specialist takes each task. Some are MCP-equipped products,
          some are discovered on demand from the live MCP registry. Reputation
          accrues with each successful task and feeds back into who gets
          picked next.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {SPECIALISTS.map((s) => (
          <SpecialistCard
            key={s.agent_id}
            spec={s}
            live={liveById.get(s.agent_id)}
          />
        ))}
      </div>
    </main>
  );
}
