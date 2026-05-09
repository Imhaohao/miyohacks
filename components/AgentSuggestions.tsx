"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatMoney, formatScore } from "@/lib/utils";

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
      // Re-run suggestions so the new specialist appears in the list.
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

  return (
    <Card>
      <CardHeader>
        <span>Recommended specialists</span>
        <span>
          {loading
            ? "scoring..."
            : data
              ? data.low_confidence
                ? "weak match"
                : `top fit ${formatScore(data.best_fit_score)}`
              : ""}
        </span>
      </CardHeader>

      {error && <p className="mb-2 text-xs text-terminal-danger">{error}</p>}

      {!loading && !error && data && data.suggestions.length === 0 && (
        <p className="text-xs text-terminal-muted">
          No specialist matched yet. Try discovery to spawn one.
        </p>
      )}

      {data && data.suggestions.length > 0 && (
        <div className="divide-y divide-terminal-border">
          {data.suggestions.map((s) => (
            <div
              key={s.agent_id}
              className="flex items-start justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-terminal-text">
                  <span>{s.display_name}</span>
                  <SourceBadge
                    discovered={s.discovered}
                    source={s.discovery_source}
                    hasEndpoint={!!s.mcp_endpoint}
                  />
                </div>
                <p className="text-xs text-terminal-muted">
                  {s.sponsor} · {s.one_liner}
                </p>
                <p className="mt-1 text-xs text-terminal-text/80">
                  {s.fit_reasoning}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs font-mono">
                <div className="text-terminal-muted">fit</div>
                <div className="text-terminal-text">
                  {formatScore(s.fit_score)}
                </div>
                <div className="mt-1 text-terminal-muted">cost</div>
                <div className="text-terminal-text">
                  {formatMoney(s.cost_baseline)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.recommend_discovery && (
        <div className="mt-3 rounded border border-dashed border-terminal-warn/60 bg-terminal-warn/5 p-3 text-xs text-terminal-warn">
          <p className="font-medium">No strong match in the current roster.</p>
          <p className="mt-1 text-terminal-muted">
            Spawn a tailor-made specialist for this campaign. It joins the
            registry and competes in the auction alongside the sponsors.
          </p>
          <button
            type="button"
            onClick={onDiscover}
            disabled={discovering}
            className="mt-2 rounded border border-terminal-warn/60 px-2 py-1 font-mono uppercase tracking-wider text-terminal-warn hover:bg-terminal-warn/10 disabled:opacity-40"
          >
            {discovering ? "synthesizing..." : "Discover a new specialist"}
          </button>
        </div>
      )}

      {discovered && (
        <div className="mt-3 rounded border border-terminal-accent/40 bg-terminal-accent/5 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-terminal-accent">
              new specialist · {discovered.specialist.display_name}
            </p>
            <SourceBadge
              discovered
              source={discovered.source}
              hasEndpoint={!!discovered.specialist.mcp_endpoint}
            />
          </div>
          <p className="mt-1 text-terminal-muted">
            {discovered.specialist.sponsor} · {discovered.specialist.one_liner}
          </p>
          {discovered.specialist.mcp_endpoint && (
            <p className="mt-1 font-mono text-[11px] text-terminal-text/80">
              MCP: {discovered.specialist.mcp_endpoint}
            </p>
          )}
          <p className="mt-1 text-terminal-text/80">
            Capabilities: {discovered.specialist.capabilities.join(", ")}
          </p>
          <p className="mt-1 text-terminal-muted">{discovered.rationale}</p>
          {discovered.verified_tools.length > 0 && (
            <p className="mt-1 text-terminal-accent/80">
              tools/list ✓ {discovered.verified_tools.slice(0, 6).join(", ")}
              {discovered.verified_tools.length > 6 ? "..." : ""}
            </p>
          )}
          {discovered.source === "synthesized" && (
            <p className="mt-1 text-terminal-warn">
              No real MCP backend matched — this is an LLM-only fallback.
            </p>
          )}
        </div>
      )}
    </Card>
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
  if (!discovered) return null;
  const map: Record<DiscoverySource, { label: string; cls: string }> = {
    catalog: {
      label: "MCP · catalog",
      cls: "bg-terminal-accent/20 text-terminal-accent",
    },
    registry: {
      label: "MCP · registry",
      cls: "bg-terminal-accent/20 text-terminal-accent",
    },
    synthesized: {
      label: "synthesized",
      cls: "bg-terminal-warn/20 text-terminal-warn",
    },
  };
  const fallback: { label: string; cls: string } = hasEndpoint
    ? { label: "MCP", cls: "bg-terminal-accent/20 text-terminal-accent" }
    : { label: "synthesized", cls: "bg-terminal-warn/20 text-terminal-warn" };
  const meta = source ? map[source] : fallback;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
