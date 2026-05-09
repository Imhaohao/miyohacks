"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { SPECIALISTS } from "@/lib/specialists/registry";
import { formatMoney, formatScore } from "@/lib/utils";
import { CheckCircle, Plug, ShieldWarning } from "@phosphor-icons/react";

export function SpecialistLeaderboard() {
  const endpointCount = SPECIALISTS.filter((s) => s.mcp_endpoint).length;
  return (
    <Card>
      <CardHeader
        title={`Specialists · ${SPECIALISTS.length}`}
        meta={
          <span className="text-brand-700">{endpointCount} live MCP</span>
        }
      />
      <div className="divide-y divide-line">
        {SPECIALISTS.map((s) => {
          const hasEndpoint = !!s.mcp_endpoint;
          const live = hasEndpoint && !!s.is_verified;
          return (
            <div
              key={s.agent_id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-ink">
                  <span className="font-medium tracking-tight">
                    {s.display_name}
                  </span>
                  {hasEndpoint && live && (
                    <Pill
                      tone="success"
                      title={`Verified MCP: ${s.mcp_endpoint}`}
                    >
                      <CheckCircle size={11} weight="fill" />
                      MCP
                    </Pill>
                  )}
                  {hasEndpoint && !live && (
                    <Pill
                      tone="warning"
                      title={`MCP endpoint configured; set ${s.mcp_api_key_env ?? "API key"} to use live tools`}
                    >
                      <ShieldWarning size={11} weight="fill" />
                      Auth needed
                    </Pill>
                  )}
                  {!hasEndpoint && (
                    <Pill tone="neutral">
                      <Plug size={11} />
                      Soft
                    </Pill>
                  )}
                </span>
                <span className="truncate text-xs text-ink-muted">
                  {s.sponsor} · {s.one_liner}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-5 text-right text-xs">
                <div className="w-24">
                  <div className="flex items-center justify-between text-[10px] text-ink-subtle">
                    <span>Reputation</span>
                    <span className="font-mono text-ink">
                      {formatScore(s.starting_reputation)}
                    </span>
                  </div>
                  <div className="score-bar mt-1">
                    <span
                      style={{
                        width: `${Math.round(s.starting_reputation * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-subtle">Cost</div>
                  <div className="font-mono text-ink">
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
