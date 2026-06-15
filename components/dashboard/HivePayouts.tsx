"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReputationChart } from "@/components/agents/ReputationChart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { currentPeriod } from "@/lib/hive/settlement-core";
import { formatMoney, formatScore } from "@/lib/utils";

interface PayoutRow {
  owner_id: string;
  agent_id: string;
  tasks_won: number;
  tasks_lost: number;
  tasks_accepted: number;
  gross_volume: number;
  estimated_payout: number;
  reputation_end: number;
}

interface EscalationRow {
  _id: string;
  task_id: string;
  kind: "low_confidence" | "conflict_tie";
  reason: string;
  created_at: number;
}

interface RepEvent {
  new_score: number;
}

function prettyAgent(id: string) {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(ms: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function HivePayouts({ ownerId }: { ownerId?: string }) {
  const period = useMemo(() => currentPeriod(Date.now()), []);
  // No auth system in this app (no Clerk/session), so payouts are scoped by
  // owner_id selection rather than a signed-in user. Owners are derived from
  // the period's accrual; the default is the highest-volume owner.
  const summary = useQuery(api.settlement.payoutSummary, { period }) as
    | PayoutRow[]
    | undefined;
  const owners = useMemo(() => {
    if (!summary) return [] as string[];
    const gross = new Map<string, number>();
    for (const row of summary) {
      gross.set(row.owner_id, (gross.get(row.owner_id) ?? 0) + row.gross_volume);
    }
    return [...gross.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }, [summary]);
  const [picked, setPicked] = useState<string | null>(null);
  const owner = picked ?? ownerId ?? owners[0] ?? "agent:mcp";
  const payouts = useQuery(api.settlement.payoutsForOwner, {
    owner_id: owner,
    period,
  }) as PayoutRow[] | undefined;
  const escalations = useQuery(api.escalations.listOpen, {
    limit: 10,
  }) as EscalationRow[] | undefined;

  const topAgent = payouts
    ? [...payouts].sort((a, b) => b.gross_volume - a.gross_volume)[0]
    : undefined;
  const events = (useQuery(api.reputation.history, {
    agent_id: topAgent?.agent_id ?? "",
  }) ?? []) as RepEvent[];

  return (
    <section className="mt-6 animate-fade-up [animation-delay:180ms]">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Hive</h2>
          <p className="mt-1 text-xs text-ink-muted">
            {period} payout accrual and human review queue.
          </p>
        </div>
        {owners.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {owners.map((o) => (
              <button
                key={o}
                onClick={() => setPicked(o)}
                className={
                  o === owner
                    ? "rounded-full bg-brand-700 px-2.5 py-1 font-mono text-[11px] font-medium text-white"
                    : "rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-ink-muted transition hover:text-ink"
                }
              >
                {o}
              </button>
            ))}
          </div>
        ) : (
          <Badge variant="outline" className="font-mono">
            {owner}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="bg-white shadow-card lg:col-span-3">
          <CardHeader className="p-5 pb-0">
            <CardTitle className="text-base font-semibold text-ink">
              Hive payouts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {payouts === undefined ? (
              <p className="py-8 text-center text-xs text-ink-muted">
                Loading payout accruals.
              </p>
            ) : payouts.length === 0 ? (
              <p className="py-8 text-center text-xs text-ink-muted">
                No settled tasks this period yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="border-b border-line text-ink-muted">
                    <tr>
                      <th className="pb-2 font-medium">Agent</th>
                      <th className="pb-2 text-right font-medium">Won</th>
                      <th className="pb-2 text-right font-medium">Accepted</th>
                      <th className="pb-2 text-right font-medium">Lost</th>
                      <th className="pb-2 text-right font-medium">Gross</th>
                      <th className="pb-2 text-right font-medium">Payout</th>
                      <th className="pb-2 text-right font-medium">Rep</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payouts.map((row) => (
                      <tr key={row.agent_id}>
                        <td className="py-3 pr-3 font-medium text-ink">
                          {prettyAgent(row.agent_id)}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {row.tasks_won}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {row.tasks_accepted}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {row.tasks_lost}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {formatMoney(row.gross_volume)}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {formatMoney(row.estimated_payout)}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {formatScore(row.reputation_end)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {topAgent && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-ink">
                    {prettyAgent(topAgent.agent_id)}
                  </span>
                  <span className="font-mono text-ink-muted">
                    {formatMoney(topAgent.gross_volume)}
                  </span>
                </div>
                <ReputationChart
                  startingScore={topAgent.reputation_end}
                  events={events}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-card lg:col-span-2">
          <CardHeader className="p-5 pb-0">
            <CardTitle className="text-base font-semibold text-ink">
              Needs review
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {escalations === undefined ? (
              <p className="py-8 text-center text-xs text-ink-muted">
                Loading review queue.
              </p>
            ) : escalations.length === 0 ? (
              <p className="py-8 text-center text-xs text-ink-muted">
                Nothing awaiting review.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {escalations.map((row) => (
                  <li key={row._id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="secondary">
                        {row.kind.replace("_", " ")}
                      </Badge>
                      <span className="shrink-0 text-[11px] text-ink-muted">
                        {formatDate(row.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-ink-muted">
                      {row.reason}
                    </p>
                    <Link
                      href={`/task/${row.task_id}`}
                      className="mt-2 inline-block font-mono text-[11px] font-medium text-brand-700 hover:text-brand-800"
                    >
                      {row.task_id}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
