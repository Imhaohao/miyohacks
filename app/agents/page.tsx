"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArborMark } from "@/components/ui/ArborMark";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatMoney, formatScore } from "@/lib/utils";
import {
  EXECUTION_STATUS_DESCRIPTIONS,
  EXECUTION_STATUS_LABELS,
} from "@/lib/agent-execution-status";
import type {
  AgentContact,
  AgentExecutionStatus,
  AgentIndustry,
  AgentProtocol,
} from "@/lib/types";
import { ArrowLeft } from "@phosphor-icons/react";

interface ContactView extends AgentContact {
  reputation_score: number;
  total_tasks_completed: number;
  total_disputes_lost: number;
  updated_at: number | null;
}
const INDUSTRIES: Array<"all" | AgentIndustry> = [
  "all",
  "software",
  "finance",
  "legal",
  "healthcare",
  "ecommerce",
  "marketing",
  "sales",
  "operations",
  "data",
  "creative-media",
];

const PROTOCOLS: Array<"all" | AgentProtocol> = [
  "all",
  "a2a",
  "mcp",
  "mock",
  "manual",
];

const EXECUTION_STATUSES: AgentExecutionStatus[] = [
  "native_mcp",
  "native_a2a",
  "arbor_real_adapter",
  "needs_vendor_a2a_endpoint",
  "mock_unconnected",
];

export default function AgentsPage() {
  const [industry, setIndustry] = useState<"all" | AgentIndustry>("all");
  const [protocol, setProtocol] = useState<"all" | AgentProtocol>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const contacts = (useQuery(api.agentContacts.list, {
    industry: industry === "all" ? undefined : industry,
    protocol: protocol === "all" ? undefined : protocol,
    verified_only: verifiedOnly,
  }) ?? []) as ContactView[];

  const counts = useMemo(() => {
    const byIndustry = new Map<string, number>();
    for (const contact of contacts) {
      byIndustry.set(contact.industry, (byIndustry.get(contact.industry) ?? 0) + 1);
    }
    return byIndustry;
  }, [contacts]);
  const executionCounts = useMemo(() => {
    const byStatus = new Map<AgentExecutionStatus, number>();
    for (const status of EXECUTION_STATUSES) byStatus.set(status, 0);
    for (const contact of contacts) {
      byStatus.set(
        contact.execution_status,
        (byStatus.get(contact.execution_status) ?? 0) + 1,
      );
    }
    return byStatus;
  }, [contacts]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-6 pb-12">
      <nav className="flex items-center justify-between">
        <ArborMark as="link" />
        <Link
          href="/"
          className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-700"
        >
          <ArrowLeft
            size={14}
            weight="bold"
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back to Arbor
        </Link>
      </nav>

      <header className="mb-6 mt-12 animate-fade-up">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Specialists for startup launch work.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
          Browse execution modes, reputation, baseline cost, and tool
          readiness before approving paid work. Native tool connections are
          separated from bridges and plan-only fallbacks.
        </p>
      </header>

      <Card className="mb-5 animate-fade-up">
        <CardHeader
          title="Registry filters"
          meta={`${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}
        />
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setIndustry(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                industry === value
                  ? "bg-brand-600 text-white"
                  : "bg-surface-muted text-ink-muted hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              {value === "all" ? "All industries" : value}
              {value !== "all" && counts.get(value) ? ` · ${counts.get(value)}` : ""}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROTOCOLS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setProtocol(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                protocol === value
                  ? "bg-ink text-white"
                  : "bg-surface-muted text-ink-muted hover:bg-surface-subtle"
              }`}
            >
              {value === "all" ? "All protocols" : value.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setVerifiedOnly((value) => !value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              verifiedOnly
                ? "bg-emerald-600 text-white"
                : "bg-surface-muted text-ink-muted hover:bg-emerald-50 hover:text-emerald-700"
            }`}
          >
            Verified only
          </button>
        </div>
      </Card>

      <section className="mb-5 grid gap-3 md:grid-cols-5">
        {EXECUTION_STATUSES.map((status) => (
          <div
            key={status}
            className="rounded-lg border border-line bg-white p-3 shadow-soft"
            title={EXECUTION_STATUS_DESCRIPTIONS[status]}
          >
            <div className="text-[11px] font-medium text-ink-muted">
              {EXECUTION_STATUS_LABELS[status]}
            </div>
            <div className="mt-1 font-mono text-2xl font-semibold text-ink">
              {executionCounts.get(status) ?? 0}
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {contacts.map((contact) => (
          <AgentContactCard key={contact.agent_id} contact={contact} />
        ))}
      </div>
    </main>
  );
}

function AgentContactCard({ contact }: { contact: ContactView }) {
  const statusTone = executionTone(contact.execution_status);
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate">{contact.display_name}</span>
            <Pill tone={contact.protocol === "mcp" || contact.protocol === "a2a" ? "info" : "neutral"}>
              {contact.protocol.toUpperCase()}
            </Pill>
            <Pill tone={statusTone}>
              {EXECUTION_STATUS_LABELS[contact.execution_status]}
            </Pill>
          </span>
        }
        meta={contact.sponsor}
      />
      <p className="mb-4 text-sm leading-relaxed text-ink-muted">
        {contact.one_liner}
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Pill tone="neutral">{contact.industry}</Pill>
        <Pill
          tone={
            contact.health_status === "healthy"
              ? "success"
              : contact.health_status === "auth_required"
                ? "warning"
                : "neutral"
          }
        >
          {contact.health_status.replace("_", " ")}
        </Pill>
        <Pill
          tone={contact.verification_status === "verified" ? "success" : "neutral"}
        >
          {contact.verification_status}
        </Pill>
      </div>
      <div className="mb-4 grid gap-2 rounded-xl bg-surface-subtle p-3 text-xs sm:grid-cols-3">
        <TrustCell
          label="Mode"
          value={EXECUTION_STATUS_LABELS[contact.execution_status]}
        />
        <TrustCell label="Baseline" value={formatMoney(contact.cost_baseline)} />
        <TrustCell
          label="Last check"
          value={contact.updated_at ? new Date(contact.updated_at).toLocaleDateString() : "Seeded"}
        />
        {contact.endpoint_url && (
          <div className="min-w-0 border-t border-line pt-2 font-mono text-[11px] text-brand-700 sm:col-span-3">
            <div className="break-all">{contact.endpoint_url}</div>
            {contact.auth_env && (
              <div className="mt-1 text-brand-600">auth: {contact.auth_env}</div>
            )}
          </div>
        )}
      </div>
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-ink-muted">Reputation</span>
          <span className="font-mono text-ink">
            {formatScore(contact.reputation_score)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand-600"
            style={{ width: `${Math.max(5, contact.reputation_score * 100)}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {contact.capabilities.slice(0, 5).map((capability) => (
          <span
            key={capability}
            className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[10px] text-ink-muted"
          >
            {capability}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-muted">
        <span>{EXECUTION_STATUS_DESCRIPTIONS[contact.execution_status]}</span>
        <span>
          {contact.total_tasks_completed} done · {contact.total_disputes_lost} disputes
        </span>
      </div>
    </Card>
  );
}

function executionTone(status: AgentExecutionStatus) {
  if (status === "native_mcp" || status === "native_a2a") return "success";
  if (status === "arbor_real_adapter") return "info";
  if (status === "needs_vendor_a2a_endpoint") return "warning";
  return "danger";
}

function TrustCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className="mt-0.5 font-mono text-ink">{value}</div>
    </div>
  );
}
