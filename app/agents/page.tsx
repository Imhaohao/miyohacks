"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SPECIALISTS } from "@/lib/specialists/registry";
import { SpecialistCard } from "@/components/agents/SpecialistCard";

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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.3em] text-terminal-muted hover:text-terminal-text"
          >
            ← Agent Auction Protocol
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-terminal-text">
            Specialist registry
          </h1>
          <p className="mt-1 text-sm text-terminal-muted">
            Five sponsor products, five different jobs. Reputation accrues
            across auctions and feeds back into the bid score.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {SPECIALISTS.map((s) => (
          <SpecialistCard key={s.agent_id} spec={s} live={liveById.get(s.agent_id)} />
        ))}
      </div>
    </main>
  );
}
