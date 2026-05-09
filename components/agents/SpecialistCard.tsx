"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReputationChart } from "./ReputationChart";
import { formatMoney, formatScore, cn } from "@/lib/utils";
import type { SpecialistConfig } from "@/lib/types";
import { CheckCircle, Plug, ShieldWarning } from "@phosphor-icons/react";

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
    <Card
      className={cn(
        "animate-fade-up",
        hasMcpEndpoint && "border-brand-200",
      )}
    >
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span>{spec.display_name}</span>
            {mcpConnected && (
              <Pill tone="success" title={`Verified MCP: ${spec.mcp_endpoint}`}>
                <CheckCircle size={11} weight="fill" />
                MCP
              </Pill>
            )}
            {hasMcpEndpoint && !mcpConnected && (
              <Pill
                tone="warning"
                title={`MCP endpoint configured; set ${spec.mcp_api_key_env ?? "API key"} to use live tools`}
              >
                <ShieldWarning size={11} weight="fill" />
                Auth needed
              </Pill>
            )}
            {!hasMcpEndpoint && (
              <Pill tone="neutral">
                <Plug size={11} />
                Soft
              </Pill>
            )}
          </span>
        }
        meta={spec.sponsor}
      />

      <p className="mb-4 text-sm text-ink-muted">{spec.one_liner}</p>

      {hasMcpEndpoint && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 font-mono text-[11px] text-brand-700">
          <span className="font-sans font-medium">
            {mcpConnected ? "Live MCP" : "MCP auth"}
          </span>
          <span className="truncate">{spec.mcp_endpoint}</span>
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-ink-muted">Reputation</span>
          <span className="font-mono text-ink">{formatScore(score)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-700 ease-out"
            style={{ width: `${score * 100}%` }}
          />
        </div>
      </div>

      <ReputationChart
        startingScore={spec.starting_reputation}
        events={events}
      />

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs">
        <Stat label="Completed" value={String(completed)} />
        <Stat label="Disputes" value={String(disputes)} />
        <Stat
          label="Dispute rate"
          value={total === 0 ? "—" : `${disputeRate.toFixed(0)}%`}
          danger={disputeRate >= 25}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {spec.capabilities.map((c) => (
          <span
            key={c}
            className="rounded-md border border-line bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-ink-muted"
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mt-3 text-xs text-ink-subtle">
        Cost baseline · {formatMoney(spec.cost_baseline)}
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
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono",
          danger ? "text-rose-600" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}
