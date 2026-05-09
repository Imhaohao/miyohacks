"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { SPECIALISTS } from "@/lib/specialists/registry";
import { formatMoney, formatScore } from "@/lib/utils";

/**
 * Static leaderboard fed from the in-process specialist registry. Once Convex
 * is wired up, replace the source with a `useQuery(api.agents.list)` call so
 * reputation updates are reactive.
 */
export function SpecialistLeaderboard() {
  return (
    <Card>
      <CardHeader>
        <span>Specialists</span>
        <span className="text-terminal-accent">live</span>
      </CardHeader>
      <div className="divide-y divide-terminal-border">
        {SPECIALISTS.map((s) => (
          <div
            key={s.agent_id}
            className="flex items-center justify-between py-2 text-sm"
          >
            <div className="flex flex-col">
              <span className="font-mono text-terminal-text">
                {s.display_name}
              </span>
              <span className="text-xs text-terminal-muted">
                {s.sponsor} · {s.one_liner}
              </span>
            </div>
            <div className="flex items-center gap-6 text-right text-xs font-mono">
              <div>
                <div className="text-terminal-muted">rep</div>
                <div className="text-terminal-text">
                  {formatScore(s.starting_reputation)}
                </div>
              </div>
              <div>
                <div className="text-terminal-muted">cost</div>
                <div className="text-terminal-text">
                  {formatMoney(s.cost_baseline)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
