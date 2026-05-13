"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { formatMoney, formatScore } from "@/lib/utils";
import { Sparkle, CircleNotch, Lightning } from "@phosphor-icons/react";

type DiscoverySource = "catalog" | "registry" | "synthesized";

interface SuggestionItem {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  cost_baseline: number;
  fit_score: number;
  fit_reasoning: string;
  discovered: boolean;
  discovery_source?: DiscoverySource;
  mcp_endpoint?: string;
  homepage_url?: string;
}

interface SuggestResponse {
  query: string;
  suggestions: SuggestionItem[];
  best_fit_score: number;
  low_confidence: boolean;
  recommend_discovery: boolean;
}

interface DiscoverResponse {
  specialist: SuggestionItem & {
    system_prompt: string;
    discovered_for?: string;
    discovery_source?: DiscoverySource;
    mcp_endpoint?: string;
    homepage_url?: string;
  };
  source: DiscoverySource;
  rationale: string;
  verified_tools: string[];
  persisted: boolean;
}

interface Props {
  prompt: string;
  taskType: string;
}

const DEBOUNCE_MS = 600;
const MIN_PROMPT_LEN = 12;

export function AgentSuggestions({ prompt, taskType }: Props) {
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoverResponse | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    setDiscovered(null);
    if (prompt.trim().length < MIN_PROMPT_LEN) {
      setData(null);
      setError(null);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/v1/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt, task_type: taskType, top_n: 3 }),
        });
        const json = await res.json();
        if (myReq !== reqIdRef.current) return;
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "suggest failed");
        }
        setData(json as SuggestResponse);
      } catch (e) {
        if (myReq !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [prompt, taskType]);

  async function onDiscover() {
    setDiscovering(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, task_type: taskType, persist: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "discover failed");
      setDiscovered(json as DiscoverResponse);
      reqIdRef.current += 1;
      const reReq = reqIdRef.current;
      const refresh = await fetch("/api/v1/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, task_type: taskType, top_n: 3 }),
      });
      const refreshJson = await refresh.json();
      if (refresh.ok && reReq === reqIdRef.current) {
        setData(refreshJson as SuggestResponse);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
    }
  }

  if (prompt.trim().length < MIN_PROMPT_LEN) return null;

  const meta = loading ? (
    <span className="inline-flex items-center gap-1.5">
      <CircleNotch size={12} className="animate-spin" />
      Scoring
    </span>
  ) : data ? (
    data.low_confidence ? (
      <span className="text-amber-700">Weak match</span>
    ) : (
      <span>Top fit · {formatScore(data.best_fit_score)}</span>
    )
  ) : null;

  return (
    <Card className="animate-fade-up">
      <CardHeader title="Recommended specialists" meta={meta} />

      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {loading && !data && <SuggestionSkeleton />}

      {!loading && !error && data && data.suggestions.length === 0 && (
        <p className="rounded-xl bg-surface-subtle px-3 py-2 text-sm text-ink-muted">
          No specialist matched this brief yet. Add a little more detail about
          the goal, channel, or artifact you want, then Arbor can rank a better
          shortlist.
        </p>
      )}

      {data && data.suggestions.length > 0 && (
        <div className="divide-y divide-line">
          {data.suggestions.map((s) => (
            <div
              key={s.agent_id}
              className="flex animate-fade-up flex-col gap-3 py-3 text-sm sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-ink">
                  <span className="font-medium tracking-tight">
                    {s.display_name}
                  </span>
                  <SourceBadge
                    discovered={s.discovered}
                    source={s.discovery_source}
                    hasEndpoint={!!s.mcp_endpoint}
                  />
                </div>
                <p className="text-xs text-ink-muted">
                  {s.sponsor} · {s.one_liner}
                </p>
                <p className="mt-1.5 text-xs text-ink-soft">
                  {s.fit_reasoning}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.capabilities.slice(0, 3).map((capability) => (
                    <span
                      key={capability}
                      className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[10px] text-ink-muted"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid w-full shrink-0 grid-cols-3 gap-2 rounded-xl bg-surface-subtle p-3 text-xs sm:w-44">
                <div>
                  <div className="text-ink-subtle">Fit</div>
                  <div className="font-mono text-ink">
                    {formatScore(s.fit_score)}
                  </div>
                </div>
                <div>
                  <div className="text-ink-subtle">Cost</div>
                  <div className="font-mono text-ink">
                    {formatMoney(s.cost_baseline)}
                  </div>
                </div>
                <div>
                  <div className="text-ink-subtle">Mode</div>
                  <div className="font-mono text-ink">
                    {s.mcp_endpoint ? "Tool" : "Plan"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.recommend_discovery && (
        <div className="mt-4 animate-fade-up rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">No strong match in the current roster.</p>
          <p className="mt-1 text-xs text-amber-800">
            Spawn a tailor-made specialist for this task. It joins the registry
            and competes alongside the existing specialists.
          </p>
          <button
            type="button"
            onClick={onDiscover}
            disabled={discovering}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-amber-800 shadow-hairline hover:bg-amber-100 hover:shadow-hairline-strong disabled:opacity-50"
          >
            {discovering ? (
              <>
                <CircleNotch size={12} className="animate-spin" />
                Synthesizing…
              </>
            ) : (
              <>
                <Sparkle size={12} weight="fill" />
                Discover a new specialist
              </>
            )}
          </button>
        </div>
      )}

      {discovered && (
        <div className="mt-4 animate-fade-up rounded-xl bg-brand-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 font-medium text-brand-700">
              <Lightning size={14} weight="fill" />
              New specialist · {discovered.specialist.display_name}
            </p>
            <SourceBadge
              discovered
              source={discovered.source}
              hasEndpoint={!!discovered.specialist.mcp_endpoint}
            />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {discovered.specialist.sponsor} ·{" "}
            {discovered.specialist.one_liner}
          </p>
          {discovered.specialist.mcp_endpoint && (
            <p className="mt-1 font-mono text-[11px] text-ink-soft">
              MCP: {discovered.specialist.mcp_endpoint}
            </p>
          )}
          <p className="mt-1 text-xs text-ink-soft">
            Capabilities: {discovered.specialist.capabilities.join(", ")}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {discovered.rationale}
          </p>
          {discovered.verified_tools.length > 0 && (
            <p className="mt-1 text-xs text-emerald-700">
              tools/list ✓ {discovered.verified_tools.slice(0, 6).join(", ")}
              {discovered.verified_tools.length > 6 ? "…" : ""}
            </p>
          )}
          {discovered.source === "synthesized" && (
            <p className="mt-1 text-xs text-amber-700">
              No real MCP backend matched — this is an LLM-only fallback.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function SuggestionSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 py-1"
        >
          <div className="flex-1 space-y-1.5">
            <div className="shimmer h-3.5 w-1/3 rounded" />
            <div className="shimmer h-3 w-3/4 rounded" />
          </div>
          <div className="shimmer h-8 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

function SourceBadge({
  discovered,
  source,
  hasEndpoint,
}: {
  discovered: boolean;
  source?: DiscoverySource;
  hasEndpoint: boolean;
}) {
  if (!discovered) {
    return hasEndpoint ? (
      <Pill tone="success">Live tools</Pill>
    ) : (
      <Pill tone="neutral">Plan-only</Pill>
    );
  }
  const map: Record<DiscoverySource, { label: string; tone: PillTone }> = {
    catalog: { label: "MCP · catalog", tone: "success" },
    registry: { label: "MCP · registry", tone: "success" },
    synthesized: { label: "Synthesized", tone: "warning" },
  };
  const fallback: { label: string; tone: PillTone } = hasEndpoint
    ? { label: "MCP", tone: "success" }
    : { label: "Synthesized", tone: "warning" };
  const meta = source ? map[source] : fallback;
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}
