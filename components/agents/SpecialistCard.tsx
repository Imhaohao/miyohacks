"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReputationChart } from "./ReputationChart";
import { formatMoney, formatScore, cn } from "@/lib/utils";
import type { SpecialistConfig } from "@/lib/types";

interface LiveAgent {
  agent_id: string;
  reputation_score: number;
  total_tasks_completed: number;
  total_disputes_lost: number;
}

interface RepEvent {
  _id: string;
  new_score: number;
  delta: number;
  event_type: string;
}

export function SpecialistCard({
  spec,
  live,
}: {
  spec: SpecialistConfig;
  live: LiveAgent | undefined;
}) {
  const events = (useQuery(api.reputation.history, {
    agent_id: spec.agent_id,
  }) ?? []) as RepEvent[];

  const score = live?.reputation_score ?? spec.starting_reputation;
  const completed = live?.total_tasks_completed ?? 0;
  const disputes = live?.total_disputes_lost ?? 0;
  const total = completed + disputes;
  const disputeRate = total === 0 ? 0 : (disputes / total) * 100;

  const hasMcpEndpoint = !!spec.mcp_endpoint;
  const mcpConnected = hasMcpEndpoint && !!spec.is_verified;

  return (
    <Card className={hasMcpEndpoint ? "border-terminal-accent/40" : undefined}>
      <CardHeader>
        <span className="flex items-center gap-2">
          {spec.display_name}
          {hasMcpEndpoint ? (
            <span
              title={
                mcpConnected
                  ? `Verified MCP: ${spec.mcp_endpoint}`
                  : `MCP endpoint configured; set ${spec.mcp_api_key_env ?? "API key"} to use live tools`
              }
              className={
                mcpConnected
                  ? "rounded bg-terminal-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-terminal-accent"
                  : "rounded bg-terminal-warn/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-terminal-warn"
              }
            >
              {mcpConnected ? "MCP ✓" : "MCP auth"}
            </span>
          ) : (
            <span className="rounded bg-terminal-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-terminal-muted">
              soft
            </span>
          )}
        </span>
        <span>{spec.sponsor}</span>
      </CardHeader>

      <p className="mb-3 text-xs text-terminal-muted">{spec.one_liner}</p>

      {hasMcpEndpoint && (
        <div className="mb-3 flex items-center gap-2 rounded border border-terminal-accent/30 bg-terminal-accent/5 px-2 py-1 font-mono text-[10px] text-terminal-accent">
          <span className="uppercase tracking-wider">
            {mcpConnected ? "live mcp ->" : "mcp auth ->"}
          </span>
          <span className="truncate">{spec.mcp_endpoint}</span>
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-terminal-muted">
          <span>reputation</span>
          <span className="font-mono text-terminal-text">
            {formatScore(score)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-terminal-border">
          <div
            className="h-full bg-terminal-accent transition-[width] duration-700 ease-out"
            style={{ width: `${score * 100}%` }}
          />
        </div>
      </div>

      <ReputationChart startingScore={spec.starting_reputation} events={events} />

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-terminal-border pt-3 text-xs">
        <Stat label="completed" value={String(completed)} />
        <Stat label="disputes" value={String(disputes)} />
        <Stat
          label="dispute %"
          value={total === 0 ? "—" : `${disputeRate.toFixed(0)}%`}
          danger={disputeRate >= 25}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {spec.capabilities.map((c) => (
          <span
            key={c}
            className="rounded border border-terminal-border bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-terminal-muted"
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mt-3 text-[10px] text-terminal-muted">
        cost baseline · {formatMoney(spec.cost_baseline)}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-terminal-muted">
        {label}
      </div>
      <div
        className={cn(
          "font-mono",
          danger ? "text-terminal-danger" : "text-terminal-text",
        )}
      >
        {value}
      </div>
    </div>
  );
}
