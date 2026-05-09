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

interface RepDimensionRow {
  speed_score: number;
  estimate_accuracy: number;
  quality_score: number;
  value_score: number;
  overall: number;
}

function averageDimensions(rows: RepDimensionRow[]) {
  if (rows.length === 0) return null;
  const acc = rows.reduce(
    (a, r) => ({
      speed: a.speed + r.speed_score,
      estimate: a.estimate + r.estimate_accuracy,
      quality: a.quality + r.quality_score,
      value: a.value + r.value_score,
      overall: a.overall + r.overall,
    }),
    { speed: 0, estimate: 0, quality: 0, value: 0, overall: 0 },
  );
  const n = rows.length;
  return {
    speed: acc.speed / n,
    estimate: acc.estimate / n,
    quality: acc.quality / n,
    value: acc.value / n,
    overall: acc.overall / n,
    tasks: n,
  };
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
  const dimensionRows = (useQuery(api.reputationDimensions.forAgent, {
    agent_id: spec.agent_id,
  }) ?? []) as RepDimensionRow[];
  const dims = averageDimensions(dimensionRows);

  const score = live?.reputation_score ?? spec.starting_reputation;
  const completed = live?.total_tasks_completed ?? 0;
  const disputes = live?.total_disputes_lost ?? 0;
  const total = completed + disputes;
  const disputeRate = total === 0 ? 0 : (disputes / total) * 100;

  const hasMcpEndpoint = !!spec.mcp_endpoint;
  const mcpConnected = hasMcpEndpoint && !!spec.is_verified;

  return (
    <Card className="animate-fade-up">
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
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 font-mono text-[11px] text-brand-700">
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

      {dims ? (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-surface-subtle p-3">
          <DimensionBar label="Quality" value={dims.quality} />
          <DimensionBar label="Speed" value={dims.speed} />
          <DimensionBar label="Estimate accuracy" value={dims.estimate} />
          <DimensionBar label="Value" value={dims.value} />
          <div className="col-span-2 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-ink-muted">
            <span>Overall · {formatScore(dims.overall)}</span>
            <span>
              {dims.tasks} task{dims.tasks === 1 ? "" : "s"} measured
            </span>
          </div>
        </div>
      ) : (
        <p className="mb-4 rounded-xl bg-surface-subtle px-3 py-2 text-[11px] text-ink-muted">
          No completed tasks yet — speed, estimate accuracy, quality, and value
          scores appear after the first run.
        </p>
      )}

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
            className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[10px] text-ink-muted"
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

function DimensionBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-ink-muted">{label}</span>
        <span className="font-mono text-ink">{formatScore(value)}</span>
      </div>
      <div className="score-bar mt-1">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
