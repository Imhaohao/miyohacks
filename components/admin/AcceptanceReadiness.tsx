"use client";

import { useEffect, useState } from "react";

interface AgentRecord {
  agent_id: string;
  display_name: string;
  sponsor: string;
  readiness: "ready" | "blocked" | "needs_fix" | "untested";
  in_domain: { state: string; reason?: string; duration_ms?: number };
  out_of_domain: { state: string; reason?: string; duration_ms?: number };
  notes?: string;
}

interface ReleaseGate {
  ok: boolean;
  reason: string;
  blockers: Array<{ agent_id: string; readiness: string; reason: string }>;
}

interface SnapshotPayload {
  snapshot: null | {
    run_id: string;
    generated_at: number;
    judge_mode: "rubric" | "llm";
    summary: {
      total: number;
      ready: number;
      blocked: number;
      needs_fix: number;
      untested: number;
    };
    agents: AgentRecord[];
  };
  releaseGate: ReleaseGate;
}

const READINESS_STYLE: Record<AgentRecord["readiness"], string> = {
  ready: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  blocked: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  needs_fix: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  untested: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

function relativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AcceptanceReadiness() {
  const [data, setData] = useState<SnapshotPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/acceptance", { cache: "no-store" });
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const body = (await res.json()) as SnapshotPayload;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <p className="text-sm text-ink-muted">Loading readiness…</p>;
  if (error) return <p className="text-sm text-rose-400">Error: {error}</p>;
  if (!data) return null;

  const { snapshot, releaseGate } = data;

  if (!snapshot) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Acceptance readiness</h1>
        <p className="text-sm text-ink-muted">
          No snapshot yet. Run the harness from your shell:
        </p>
        <pre className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-200 overflow-x-auto">
          {`node --env-file=.env.local --import tsx scripts/acceptance-run.ts --write-snapshot`}
        </pre>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </section>
    );
  }

  const { summary, agents, judge_mode, generated_at } = snapshot;

  return (
    <section className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Acceptance readiness</h1>
          <p className="text-sm text-ink-muted">
            judge={judge_mode} · captured {relativeTime(generated_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </header>

      <div
        className={`rounded-lg border p-4 ${
          releaseGate.ok
            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200"
            : "border-rose-500/40 bg-rose-500/5 text-rose-200"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Release gate: {releaseGate.ok ? "open" : "blocked"}
          </h2>
          <span className="text-xs text-ink-muted">
            {summary.ready} ready · {summary.blocked} blocked · {summary.needs_fix} needs fix · {summary.untested} untested
          </span>
        </div>
        <p className="mt-1 text-sm">{releaseGate.reason}</p>
        {releaseGate.blockers.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {releaseGate.blockers.map((b) => (
              <li key={b.agent_id}>
                <span className="font-mono">{b.agent_id}</span> ({b.readiness})
                {b.reason ? ` — ${b.reason}` : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Agent</th>
              <th className="px-3 py-2 text-left">Sponsor</th>
              <th className="px-3 py-2 text-left">Readiness</th>
              <th className="px-3 py-2 text-left">In-domain</th>
              <th className="px-3 py-2 text-left">Out-of-domain</th>
              <th className="px-3 py-2 text-left">Reason / notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {agents.map((agent) => (
              <tr key={agent.agent_id} className="align-top">
                <td className="px-3 py-2 font-mono text-xs">{agent.agent_id}</td>
                <td className="px-3 py-2 text-zinc-400">{agent.sponsor}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${READINESS_STYLE[agent.readiness]}`}
                  >
                    {agent.readiness}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{agent.in_domain.state}</td>
                <td className="px-3 py-2 font-mono text-xs">{agent.out_of_domain.state}</td>
                <td className="px-3 py-2 text-xs text-zinc-300">
                  {agent.in_domain.reason ?? agent.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
