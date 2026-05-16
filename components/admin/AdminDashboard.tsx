"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatCredits } from "@/lib/payments";
import type {
  AdminAction,
  AdminAgentsResponse,
  AdminOverview,
  AdminPaymentsResponse,
  AdminTasksResponse,
} from "@/lib/admin-types";
import { cn } from "@/lib/utils";
import {
  Bank,
  ChatCircle,
  CircleNotch,
  Gauge,
  Lightning,
  ShieldCheck,
  Warning,
} from "@phosphor-icons/react";
import { AgentChat } from "./AgentChat";

type Tab = "overview" | "tasks" | "payments" | "agents" | "chat" | "incidents";

interface AdminState {
  overview?: AdminOverview;
  tasks?: AdminTasksResponse;
  payments?: AdminPaymentsResponse;
  agents?: AdminAgentsResponse;
}

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [state, setState] = useState<AdminState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    setError(null);
    try {
      const [overview, tasks, payments, agents] = await Promise.all([
        getJson<AdminOverview>("/api/admin/overview"),
        getJson<AdminTasksResponse>("/api/admin/tasks?limit=100"),
        getJson<AdminPaymentsResponse>("/api/admin/payments"),
        getJson<AdminAgentsResponse>("/api/admin/agents"),
      ]);
      setState({ overview, tasks, payments, agents });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(interval);
  }, []);

  async function runAction(
    action: AdminAction,
    targetId: string,
    payload?: { verdict?: "accept" | "reject" },
  ) {
    if (!reason.trim()) {
      setError("Admin action reason is required.");
      return;
    }
    setActionBusy(`${action}:${targetId}`);
    setError(null);
    try {
      await postJson("/api/admin/actions", {
        action,
        target_id: targetId,
        reason,
        payload,
      });
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(null);
    }
  }

  const incidentCount = useMemo(() => {
    const failedTasks = state.overview?.totals.failed_tasks ?? 0;
    const failedPayouts = state.overview?.totals.failed_payouts ?? 0;
    const disputes = state.overview?.totals.disputed_tasks ?? 0;
    return failedTasks + failedPayouts + disputes;
  }, [state.overview]);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">
              <ShieldCheck size={16} weight="bold" />
              Admin console
            </div>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
              Arbor operations
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={incidentCount > 0 ? "warning" : "success"}>
              {incidentCount} incident signals
            </Pill>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              {loading ? <CircleNotch size={14} className="animate-spin" /> : <Gauge size={14} weight="bold" />}
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(["overview", "tasks", "payments", "agents", "chat", "incidents"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize",
              tab === item
                ? "bg-brand-600 text-white"
                : "bg-surface-muted text-ink-muted hover:bg-brand-50 hover:text-brand-700",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <label className="block text-sm font-medium text-ink">
        Admin action reason
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required before any admin mutation..."
          className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-600 focus:outline-none focus:shadow-ring"
        />
      </label>

      {tab === "overview" && <Overview overview={state.overview} />}
      {tab === "tasks" && (
        <Tasks
          data={state.tasks}
          actionBusy={actionBusy}
          runAction={runAction}
        />
      )}
      {tab === "payments" && (
        <Payments
          data={state.payments}
          actionBusy={actionBusy}
          runAction={runAction}
        />
      )}
      {tab === "agents" && (
        <Agents
          data={state.agents}
          actionBusy={actionBusy}
          runAction={runAction}
        />
      )}
      {tab === "chat" && (
        <Card>
          <CardHeader
            title="Live agent chat"
            meta={
              <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
                <ChatCircle size={14} weight="bold" />
                A2A bridge · POST /api/a2a/agents/:id
              </span>
            }
          />
          <p className="mb-3 text-sm text-ink-muted">
            Send live <span className="font-mono">message/send</span> requests
            to any agent through the same A2A bridge external clients use.
            Responses surface real <span className="font-mono">failed</span>{" "}
            states for unconnected agents instead of hiding them behind a
            placeholder.
          </p>
          <AgentChat
            agents={
              state.agents?.agents.map((agent) => ({
                agent_id: agent.agent_id,
                display_name: agent.display_name,
              })) ?? []
            }
          />
        </Card>
      )}
      {tab === "incidents" && (
        <Incidents
          overview={state.overview}
          payments={state.payments}
          actionBusy={actionBusy}
          runAction={runAction}
        />
      )}
    </div>
  );
}

function Overview({ overview }: { overview?: AdminOverview }) {
  if (!overview) return <LoadingCard />;
  const metrics = [
    ["Tasks", overview.totals.tasks],
    ["Credits purchased", overview.totals.credits_purchased],
    ["Escrow locked", overview.totals.escrow_locked],
    ["Agent earnings", overview.totals.agent_earnings_available],
    ["Platform fees", overview.totals.platform_fees],
    ["Failed payouts", overview.totals.failed_payouts],
  ] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <Card>
        <CardHeader title="Marketplace health" meta={new Date(overview.generated_at).toLocaleTimeString()} />
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map(([label, value]) => (
            <Metric key={label} label={label} value={formatMetric(label, value)} />
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Task funnel" meta="by status" />
        <div className="space-y-2">
          {overview.task_counts.map((row) => (
            <Bar key={row.status} label={row.status} value={row.count} max={overview.totals.tasks || 1} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Tasks({
  data,
  actionBusy,
  runAction,
}: {
  data?: AdminTasksResponse;
  actionBusy: string | null;
  runAction: (action: AdminAction, targetId: string, payload?: { verdict?: "accept" | "reject" }) => Promise<void>;
}) {
  if (!data) return <LoadingCard />;
  return (
    <Card>
      <CardHeader title="Tasks" meta={`${data.tasks.length} latest`} />
      <div className="space-y-3">
        {data.tasks.map((task) => (
          <div key={task._id} className="rounded-xl bg-surface-subtle p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={task.status === "failed" || task.status === "disputed" ? "danger" : "neutral"}>
                    {task.status}
                  </Pill>
                  <Pill tone="brand">{task.payment_status ?? "unfunded"}</Pill>
                  {task.winning_agent_id && <span className="font-mono text-xs text-ink-muted">{task.winning_agent_id}</span>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-ink">{task.prompt}</p>
                <div className="mt-2 font-mono text-xs text-ink-muted">
                  {task._id} · budget {formatCredits(task.max_budget)} · paid {formatCredits(task.price_paid ?? 0)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-ink shadow-hairline hover:bg-surface-subtle" href={`/task/${task._id}`}>
                  Open
                </Link>
                <ActionButton
                  busy={actionBusy === `cancel_task:${task._id}`}
                  label="Cancel"
                  onClick={() => runAction("cancel_task", task._id)}
                />
                <ActionButton
                  busy={actionBusy === `override_judge:${task._id}`}
                  label="Accept override"
                  onClick={() => runAction("override_judge", task._id, { verdict: "accept" })}
                />
                <ActionButton
                  busy={actionBusy === `override_judge:${task._id}`}
                  label="Reject override"
                  onClick={() => runAction("override_judge", task._id, { verdict: "reject" })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Payments({
  data,
  actionBusy,
  runAction,
}: {
  data?: AdminPaymentsResponse;
  actionBusy: string | null;
  runAction: (action: AdminAction, targetId: string) => Promise<void>;
}) {
  if (!data) return <LoadingCard />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Buyer wallets" meta={`${data.buyer_wallets.length} buyers`} />
        <Rows rows={data.buyer_wallets.slice(0, 12).map((wallet) => ({
          key: wallet.buyer_id,
          left: wallet.buyer_id,
          right: `${formatCredits(wallet.available_credits)} available · ${formatCredits(wallet.reserved_credits)} reserved`,
        }))} />
      </Card>
      <Card>
        <CardHeader title="Payouts" meta={`${data.payouts.length} recent`} />
        <div className="space-y-2">
          {data.payouts.slice(0, 12).map((payout) => (
            <div key={payout._id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-subtle px-3 py-2 text-sm">
              <div>
                <div className="font-mono text-ink">{payout.agent_id}</div>
                <div className="text-xs text-ink-muted">{payout.status} · {formatCredits(payout.amount)}</div>
              </div>
              {payout.status === "failed" && (
                <ActionButton
                  busy={actionBusy === `retry_payout:${payout._id}`}
                  label="Retry"
                  onClick={() => runAction("retry_payout", payout._id)}
                />
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title="Ledger" meta="latest entries" />
        <Rows rows={data.ledger_entries.slice(0, 18).map((entry) => ({
          key: entry.idempotency_key,
          left: `${entry.entry_type} · ${entry.account_type}:${entry.account_id}`,
          right: `${entry.amount >= 0 ? "+" : ""}${entry.amount.toFixed(2)}`,
        }))} />
      </Card>
    </div>
  );
}

function Agents({
  data,
  actionBusy,
  runAction,
}: {
  data?: AdminAgentsResponse;
  actionBusy: string | null;
  runAction: (action: AdminAction, targetId: string) => Promise<void>;
}) {
  if (!data) return <LoadingCard />;
  return (
    <Card>
      <CardHeader title="Agents" meta={`${data.agents.length} seeded agents`} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.agents.map((agent) => (
          <div key={agent.agent_id} className="rounded-xl bg-surface-subtle p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-ink">{agent.display_name}</div>
                <div className="font-mono text-xs text-ink-muted">{agent.agent_id}</div>
              </div>
              <Pill tone={agent.payouts_enabled ? "success" : "warning"}>
                {agent.payouts_enabled ? "payout ready" : "payout blocked"}
              </Pill>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Rep" value={agent.reputation_score.toFixed(2)} compact />
              <Metric label="Earnings" value={formatCredits(agent.available_earnings)} compact />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              disabled={actionBusy === `refresh_connect_account:${agent.agent_id}`}
              onClick={() => runAction("refresh_connect_account", agent.agent_id)}
            >
              {actionBusy === `refresh_connect_account:${agent.agent_id}` ? <CircleNotch size={14} className="animate-spin" /> : <Bank size={14} weight="bold" />}
              Refresh Connect
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Incidents({
  overview,
  payments,
  actionBusy,
  runAction,
}: {
  overview?: AdminOverview;
  payments?: AdminPaymentsResponse;
  actionBusy: string | null;
  runAction: (action: AdminAction, targetId: string) => Promise<void>;
}) {
  if (!overview || !payments) return <LoadingCard />;
  const staleSessions = payments.checkout_sessions.filter((session) => session.status !== "completed");
  const failedPayouts = payments.payouts.filter((payout) => payout.status === "failed");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Task incidents" meta={`${overview.recent_failures.length} recent`} />
        <Rows rows={overview.recent_failures.map((task) => ({
          key: task._id,
          left: `${task.status} · ${task.prompt.slice(0, 80)}`,
          right: task.price_paid ? formatCredits(task.price_paid) : task.payment_status ?? "unfunded",
        }))} />
      </Card>
      <Card>
        <CardHeader title="Payment incidents" meta={`${staleSessions.length + failedPayouts.length} signals`} />
        <div className="space-y-2">
          {failedPayouts.map((payout) => (
            <div key={payout._id} className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <span>{payout.agent_id} payout failed · {formatCredits(payout.amount)}</span>
              <ActionButton
                busy={actionBusy === `retry_payout:${payout._id}`}
                label="Retry"
                onClick={() => runAction("retry_payout", payout._id)}
              />
            </div>
          ))}
          {staleSessions.slice(0, 8).map((session) => (
            <div key={session.session_id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Checkout {session.status} · {session.buyer_id} · {formatCredits(session.credits)}
            </div>
          ))}
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Audit trail" meta="admin events" />
        <Rows rows={overview.recent_admin_events.map((event) => ({
          key: event._id,
          left: `${event.action} · ${event.target_type}:${event.target_id}`,
          right: new Date(event.created_at).toLocaleString(),
        }))} />
      </Card>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <div className={cn("rounded-xl bg-surface-subtle", compact ? "p-2" : "p-4")}>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(3, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: Array<{ key: string; left: string; right: string }> }) {
  if (rows.length === 0) {
    return <div className="rounded-xl bg-surface-subtle p-4 text-sm text-ink-muted">No records.</div>;
  }
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1fr_auto] gap-3 bg-white px-3 py-2 text-sm">
          <span className="truncate text-ink">{row.left}</span>
          <span className="font-mono text-xs text-ink-muted">{row.right}</span>
        </div>
      ))}
    </div>
  );
}

function ActionButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClick}>
      {busy ? <CircleNotch size={14} className="animate-spin" /> : <Lightning size={14} weight="bold" />}
      {label}
    </Button>
  );
}

function LoadingCard() {
  return (
    <Card>
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <CircleNotch size={16} className="animate-spin" />
        Loading admin data...
      </div>
    </Card>
  );
}

function formatMetric(label: string, value: number) {
  return label.toLowerCase().includes("credits") ||
    label.toLowerCase().includes("escrow") ||
    label.toLowerCase().includes("earnings") ||
    label.toLowerCase().includes("fees")
    ? formatCredits(value)
    : value.toLocaleString();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const error = json as { error?: string };
    throw new Error(error.error ?? `Request failed: ${res.status}`);
  }
  return json;
}
