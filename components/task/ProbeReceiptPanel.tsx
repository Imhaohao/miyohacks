"use client";

import { useMemo } from "react";
import type { AgentToolCallDoc } from "@/lib/task-view";
import type { SpecialistProvenance } from "@/lib/types";

export interface BidProbeDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  bid_id?: string;
  agent_id: string;
  public_tier: string; // "native-a2a" | "a2a-bridge" | "not-a2a-yet"
  probe_status: "pass" | "fail" | "demo_lane";
  duration_ms: number;
  response_excerpt?: string;
  error_message?: string;
  created_at: number;
}

export interface ProbeReceiptPanelProps {
  probes: BidProbeDoc[];
  toolCalls: AgentToolCallDoc[];
  provenance?: SpecialistProvenance;
  winnerAgentId?: string;
}

function TierPill({ tier }: { tier: string }) {
  if (tier === "native-a2a") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
        native-a2a
      </span>
    );
  }
  if (tier === "a2a-bridge") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
        a2a-bridge
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium italic bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      not-a2a-yet
    </span>
  );
}

function StatusDot({ status }: { status: BidProbeDoc["probe_status"] }) {
  const cls =
    status === "pass"
      ? "bg-green-500"
      : status === "fail"
        ? "bg-red-500"
        : "bg-gray-400";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full flex-shrink-0 mt-0.5 ${cls}`}
      title={status}
    />
  );
}

export default function ProbeReceiptPanel({
  probes,
  toolCalls,
  provenance,
  winnerAgentId,
}: ProbeReceiptPanelProps) {
  const winnerCalls = useMemo(
    () =>
      winnerAgentId
        ? toolCalls.filter((tc) => tc.agent_id === winnerAgentId)
        : [],
    [toolCalls, winnerAgentId],
  );

  const receipt = useMemo(() => {
    if (!winnerAgentId) return null;
    const reversed = [...winnerCalls].reverse();
    const external_session_id =
      reversed.find((tc) => tc.external_session_id)?.external_session_id ??
      provenance?.external_session_id;
    const events_observed = winnerCalls.reduce(
      (sum, tc) => sum + (tc.events_observed ?? 0),
      0,
    );
    const artifact_present = winnerCalls.some((tc) => tc.artifact_present === true);
    const pr_url = reversed.find((tc) => tc.pr_url)?.pr_url;
    const artifact_hash = reversed.find((tc) => tc.artifact_hash)?.artifact_hash;
    return { external_session_id, events_observed, artifact_present, pr_url, artifact_hash };
  }, [winnerCalls, winnerAgentId, provenance]);

  const banner = useMemo(() => {
    if (!receipt) return null;
    const missing: string[] = [];
    if (!receipt.external_session_id) missing.push("session_id");
    if (!receipt.events_observed) missing.push("events_observed");
    if (!receipt.artifact_present) missing.push("artifact");
    if (missing.length === 0) {
      return { ok: true, label: "Fulfilled — receipt complete" };
    }
    return { ok: false, label: `Partial receipt — missing: ${missing.join(", ")}` };
  }, [receipt]);

  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-5">
      {/* Heading */}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Capability probes
      </h3>

      {/* Probe table */}
      {probes.length === 0 ? (
        <p className="text-xs text-ink-muted">No probes recorded.</p>
      ) : (
        <div className="grid gap-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-[minmax(0,1.5fr)_auto_auto_auto_minmax(0,2fr)] gap-x-3 text-[10px] font-medium uppercase tracking-wide text-ink-muted border-b border-line pb-1">
            <span>Agent</span>
            <span>Tier</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Excerpt</span>
          </div>
          {probes.map((probe) => {
            const excerpt = probe.response_excerpt ?? probe.error_message ?? "";
            const truncated =
              excerpt.length > 60 ? excerpt.slice(0, 60) + "…" : excerpt;
            return (
              <div
                key={probe._id}
                className="grid grid-cols-[minmax(0,1.5fr)_auto_auto_auto_minmax(0,2fr)] gap-x-3 items-start text-xs"
              >
                <span className="font-mono text-ink truncate">{probe.agent_id}</span>
                <TierPill tier={probe.public_tier} />
                <StatusDot status={probe.probe_status} />
                <span className="text-ink-muted tabular-nums whitespace-nowrap">
                  {probe.duration_ms}ms
                </span>
                <span
                  className="font-mono text-xs text-ink-muted truncate"
                  title={excerpt}
                >
                  {truncated}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Fulfillment receipt */}
      {receipt && (
        <div className="space-y-2 border-t border-line pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Fulfillment receipt
          </h4>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <span className="text-ink-muted">session_id</span>
            <span className="font-mono text-ink">
              {receipt.external_session_id ?? <span className="text-ink-muted italic">—</span>}
            </span>
            <span className="text-ink-muted">events_observed</span>
            <span className="font-mono text-ink">{receipt.events_observed}</span>
            <span className="text-ink-muted">artifact_present</span>
            <span className="font-mono text-ink">
              {receipt.artifact_present ? "true" : "false"}
            </span>
            <span className="text-ink-muted">pr_url</span>
            <span className="font-mono text-ink">
              {receipt.pr_url ? (
                <a
                  href={receipt.pr_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  {receipt.pr_url}
                </a>
              ) : (
                <span className="text-ink-muted italic">—</span>
              )}
            </span>
            <span className="text-ink-muted">artifact_hash</span>
            <span
              className="font-mono text-xs text-ink truncate"
              title={receipt.artifact_hash ?? undefined}
            >
              {receipt.artifact_hash ? (
                receipt.artifact_hash.slice(0, 32) +
                (receipt.artifact_hash.length > 32 ? "…" : "")
              ) : (
                <span className="text-ink-muted italic">—</span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Banner */}
      {banner && (
        <div
          className={`rounded-lg px-4 py-2.5 text-xs font-medium ${
            banner.ok
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {banner.ok ? "✓" : "⚠"} {banner.label}
        </div>
      )}
    </div>
  );
}
