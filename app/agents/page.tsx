"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArborMark } from "@/components/ui/ArborMark";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatMoney, formatScore } from "@/lib/utils";
import type { AgentContact, AgentIndustry, AgentProtocol } from "@/lib/types";
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
          100 agent contacts across industries.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
          Arbor brokers tasks across A2A, MCP, mock, and manual specialists.
          The auction only invites the best-fit shortlist, so broad coverage
          does not mean noisy bidding.
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {contacts.map((contact) => (
          <AgentContactCard key={contact.agent_id} contact={contact} />
        ))}
      </div>
    </main>
  );
}

function AgentContactCard({ contact }: { contact: ContactView }) {
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate">{contact.display_name}</span>
            <Pill tone={contact.protocol === "mcp" || contact.protocol === "a2a" ? "info" : "neutral"}>
              {contact.protocol.toUpperCase()}
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
      {contact.endpoint_url && (
        <div className="mb-4 rounded-lg bg-brand-50 px-3 py-2 font-mono text-[11px] text-brand-700">
          <div className="truncate">{contact.endpoint_url}</div>
          {contact.auth_env && (
            <div className="mt-1 text-brand-600">auth: {contact.auth_env}</div>
          )}
        </div>
      )}
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
        <span>Baseline {formatMoney(contact.cost_baseline)}</span>
        <span>
          {contact.total_tasks_completed} done · {contact.total_disputes_lost} disputes
        </span>
      </div>
    </Card>
  );
}
