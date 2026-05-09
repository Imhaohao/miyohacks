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
  const endpointCount = SPECIALISTS.filter((s) => s.mcp_endpoint).length;
  return (
    <Card>
      <CardHeader>
        <span>Campaign agents · {SPECIALISTS.length}</span>
        <span className="text-terminal-accent">
          {endpointCount} MCP endpoint
        </span>
      </CardHeader>
      <div className="divide-y divide-terminal-border">
        {SPECIALISTS.map((s) => {
          const hasEndpoint = !!s.mcp_endpoint;
          const live = hasEndpoint && !!s.is_verified;
          return (
            <div
              key={s.agent_id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-mono text-terminal-text">
                  {s.display_name}
                  {hasEndpoint && (
                    <span
                      title={
                        live
                          ? `Verified MCP: ${s.mcp_endpoint}`
                          : `MCP endpoint configured; set ${s.mcp_api_key_env ?? "API key"} to use live tools`
                      }
                      className={
                        live
                          ? "rounded bg-terminal-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-terminal-accent"
                          : "rounded bg-terminal-warn/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-terminal-warn"
                      }
                    >
                      {live ? "MCP ✓" : "MCP auth"}
                    </span>
                  )}
                  {!hasEndpoint && (
                    <span className="rounded bg-terminal-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-terminal-muted">
                      soft
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-terminal-muted">
                  {s.sponsor} · {s.one_liner}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-6 text-right text-xs font-mono">
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
          );
        })}
      </div>
    </Card>
  );
}
