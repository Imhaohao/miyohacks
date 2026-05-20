"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CheckCircle, Plug, WarningCircle } from "@phosphor-icons/react";

const INDUSTRIES = [
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
] as const;

const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-inner outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

interface RegisterResponse {
  readiness?: {
    status: "verified" | "not_ready";
    message: string;
  };
  probe?: {
    status: string;
    reason: string;
    latencyMs?: number;
    toolNames?: string[];
    cardName?: string;
  };
  error?: {
    message: string;
  };
}

export function SpecialistRegistrationForm() {
  const [agentId, setAgentId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [protocol, setProtocol] = useState<"mcp" | "a2a">("mcp");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [agentCardUrl, setAgentCardUrl] = useState("");
  const [authEnv, setAuthEnv] = useState("");
  const [industry, setIndustry] = useState<(typeof INDUSTRIES)[number]>("software");
  const [capabilities, setCapabilities] = useState("");
  const [costBaseline, setCostBaseline] = useState("0.50");
  const [startingReputation, setStartingReputation] = useState("0.55");
  const [oneLiner, setOneLiner] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RegisterResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/v1/specialists/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          display_name: displayName,
          sponsor,
          protocol,
          endpoint_url: endpointUrl,
          agent_card_url: protocol === "a2a" ? agentCardUrl : undefined,
          auth_env: authEnv,
          industry,
          capabilities,
          cost_baseline: Number(costBaseline),
          starting_reputation: Number(startingReputation),
          one_liner: oneLiner,
        }),
      });
      const body = (await response.json()) as RegisterResponse;
      setResult(body);
    } catch (error) {
      setResult({
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      setPending(false);
    }
  }

  const verified = result?.readiness?.status === "verified";
  const errorMessage = result?.error?.message;

  return (
    <form
      onSubmit={submit}
      className="mb-5 animate-fade-up rounded-lg border border-line bg-white p-4 shadow-soft"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">
            Register a specialist
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Add an MCP or A2A endpoint to the live auction registry. Arbor probes
            it immediately and exposes readiness honestly in protocol tools.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-surface-subtle p-1">
          {(["mcp", "a2a"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setProtocol(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                protocol === value
                  ? "bg-white text-brand-700 shadow-soft"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Agent id">
          <input
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            placeholder="acme-research"
            className={INPUT_CLASS}
            required
          />
        </Field>
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Acme Research"
            className={INPUT_CLASS}
            required
          />
        </Field>
        <Field label={`${protocol.toUpperCase()} endpoint`}>
          <input
            value={endpointUrl}
            onChange={(event) => setEndpointUrl(event.target.value)}
            placeholder={
              protocol === "mcp"
                ? "https://example.com/mcp"
                : "https://example.com/message/send"
            }
            className={INPUT_CLASS}
            required
          />
        </Field>
        {protocol === "a2a" ? (
          <Field label="A2A agent card">
            <input
              value={agentCardUrl}
              onChange={(event) => setAgentCardUrl(event.target.value)}
              placeholder="https://example.com/agent-card"
              className={INPUT_CLASS}
              required
            />
          </Field>
        ) : (
          <Field label="Auth env hint">
            <input
              value={authEnv}
              onChange={(event) => setAuthEnv(event.target.value)}
              placeholder="ACME_API_KEY"
              className={INPUT_CLASS}
            />
          </Field>
        )}
        {protocol === "a2a" && (
          <Field label="Auth env hint">
            <input
              value={authEnv}
              onChange={(event) => setAuthEnv(event.target.value)}
              placeholder="ACME_API_KEY"
              className={INPUT_CLASS}
            />
          </Field>
        )}
        <Field label="Sponsor">
          <input
            value={sponsor}
            onChange={(event) => setSponsor(event.target.value)}
            placeholder="Acme"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Industry">
          <select
            value={industry}
            onChange={(event) =>
              setIndustry(event.target.value as (typeof INDUSTRIES)[number])
            }
            className={INPUT_CLASS}
          >
            {INDUSTRIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cost baseline">
          <input
            value={costBaseline}
            onChange={(event) => setCostBaseline(event.target.value)}
            type="number"
            min="0.01"
            step="0.01"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Starting reputation">
          <input
            value={startingReputation}
            onChange={(event) => setStartingReputation(event.target.value)}
            type="number"
            min="0.05"
            max="1"
            step="0.01"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Capabilities">
          <textarea
            value={capabilities}
            onChange={(event) => setCapabilities(event.target.value)}
            placeholder="repo-search, requirements-analysis, report-writing"
            className={`${INPUT_CLASS} min-h-20`}
            required
          />
        </Field>
        <Field label="One-line claim">
          <textarea
            value={oneLiner}
            onChange={(event) => setOneLiner(event.target.value)}
            placeholder="What this endpoint can actually do."
            className={`${INPUT_CLASS} min-h-20`}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plug size={16} weight="bold" />
          {pending ? "Probing endpoint" : "Register and probe"}
        </button>
        {result && (
          <div
            className={`inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
              verified
                ? "bg-emerald-50 text-emerald-700"
                : errorMessage
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {verified ? (
              <CheckCircle size={16} weight="bold" />
            ) : (
              <WarningCircle size={16} weight="bold" />
            )}
            <span className="min-w-0 truncate">
              {errorMessage ?? result.readiness?.message ?? result.probe?.reason}
            </span>
          </div>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-ink-muted">
      <span>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
