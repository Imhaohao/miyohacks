"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import {
  CircleNotch,
  PaperPlaneTilt,
  ShieldCheck,
  Warning,
} from "@phosphor-icons/react";

interface AgentSummary {
  agent_id: string;
  display_name: string;
}

interface AgentCard {
  name?: string;
  description?: string;
  url?: string;
  capabilities?: {
    executionStatus?: string;
    executionLabel?: string;
    executionDescription?: string;
    backingSystem?: string;
    nativeConnection?: boolean;
  };
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: Array<{ id?: string; name?: string; description?: string; tags?: string[] }>;
}

interface A2APart {
  kind?: string;
  text?: string;
  data?: unknown;
}

interface A2AArtifact {
  name?: string;
  description?: string;
  parts?: A2APart[];
}

interface A2ATaskResult {
  id?: string;
  status?: { state?: string; message?: { parts?: A2APart[] } };
  artifacts?: A2AArtifact[];
}

interface A2AEnvelope {
  result?: A2ATaskResult;
  error?: { message?: string };
}

interface ChatTurn {
  id: string;
  agent_id: string;
  prompt: string;
  taskType: string;
  startedAt: number;
  elapsedMs?: number;
  state?: "completed" | "failed" | "error";
  text?: string;
  raw?: A2AEnvelope;
  errorMessage?: string;
}

export function AgentChat({ agents }: { agents: AgentSummary[] }) {
  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => a.agent_id.localeCompare(b.agent_id)),
    [agents],
  );
  const [selected, setSelected] = useState<string | undefined>(
    sortedAgents[0]?.agent_id,
  );
  const [card, setCard] = useState<AgentCard | undefined>();
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [taskType, setTaskType] = useState("general");
  const [busy, setBusy] = useState(false);
  // Transcripts are keyed by agent_id so switching agents doesn't drop history.
  const [history, setHistory] = useState<Record<string, ChatTurn[]>>({});
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selected) {
      setCard(undefined);
      return;
    }
    let cancelled = false;
    setCardLoading(true);
    setCardError(null);
    setCard(undefined);
    fetch(`/api/a2a/agents/${encodeURIComponent(selected)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`agent card ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
        return (await res.json()) as AgentCard;
      })
      .then((data) => {
        if (cancelled) return;
        setCard(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setCardError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [history, selected]);

  useEffect(() => {
    if (selected === "codex-writer" && taskType === "general") {
      setTaskType("implementation");
    }
  }, [selected, taskType]);

  async function send() {
    if (!selected || !prompt.trim() || busy) return;
    const turn: ChatTurn = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agent_id: selected,
      prompt: prompt.trim(),
      taskType: taskType.trim() || "general",
      startedAt: Date.now(),
    };
    setHistory((prev) => ({
      ...prev,
      [selected]: [...(prev[selected] ?? []), turn],
    }));
    setPrompt("");
    setBusy(true);
    try {
      const res = await fetch(
        `/api/a2a/agents/${encodeURIComponent(selected)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: turn.id,
            method: "message/send",
            params: {
              message: {
                role: "user",
                parts: [{ kind: "text", text: turn.prompt }],
              },
              metadata: { task_type: turn.taskType, source: "admin_console" },
            },
          }),
        },
      );
      const json = (await res.json()) as A2AEnvelope | A2ATaskResult;
      const envelope: A2AEnvelope =
        "result" in json || "error" in json
          ? (json as A2AEnvelope)
          : { result: json as A2ATaskResult };
      const elapsedMs = Date.now() - turn.startedAt;
      if (envelope.error) {
        updateTurn(selected, turn.id, {
          elapsedMs,
          state: "error",
          errorMessage: envelope.error.message ?? `HTTP ${res.status}`,
          raw: envelope,
        });
      } else {
        const result = envelope.result;
        const text = extractText(result);
        updateTurn(selected, turn.id, {
          elapsedMs,
          state: result?.status?.state === "failed" ? "failed" : "completed",
          text,
          raw: envelope,
        });
      }
    } catch (err) {
      updateTurn(selected, turn.id, {
        elapsedMs: Date.now() - turn.startedAt,
        state: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  function updateTurn(agent: string, id: string, patch: Partial<ChatTurn>) {
    setHistory((prev) => {
      const turns = prev[agent] ?? [];
      return {
        ...prev,
        [agent]: turns.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      };
    });
  }

  function clearAgentHistory() {
    if (!selected) return;
    setHistory((prev) => ({ ...prev, [selected]: [] }));
  }

  const turns = (selected && history[selected]) || [];
  const status = card?.capabilities?.executionStatus;
  const statusTone =
    status === "native_a2a" ||
    status === "native_mcp" ||
    status === "arbor_real_adapter"
      ? "success"
      : status === "needs_vendor_a2a_endpoint"
        ? "warning"
        : status === "mock_unconnected"
          ? "danger"
          : "neutral";

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="lg:max-h-[640px] lg:overflow-y-auto">
        <CardHeader title="Agents" meta={`${sortedAgents.length}`} />
        <ul className="space-y-1">
          {sortedAgents.map((agent) => (
            <li key={agent.agent_id}>
              <button
                type="button"
                onClick={() => setSelected(agent.agent_id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  selected === agent.agent_id
                    ? "bg-brand-600 text-white"
                    : "bg-surface-subtle text-ink hover:bg-brand-50 hover:text-brand-700",
                )}
              >
                <div className="font-mono text-xs">{agent.agent_id}</div>
                <div
                  className={cn(
                    "truncate text-[11px]",
                    selected === agent.agent_id
                      ? "text-white/80"
                      : "text-ink-muted",
                  )}
                >
                  {agent.display_name}
                </div>
              </button>
            </li>
          ))}
          {sortedAgents.length === 0 && (
            <li className="rounded-lg bg-surface-subtle p-3 text-xs text-ink-muted">
              No agents found.
            </li>
          )}
        </ul>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader
            title={selected ?? "Select an agent"}
            meta={
              status ? (
                <span className="inline-flex items-center gap-2">
                  <Pill tone={statusTone}>
                    {card?.capabilities?.executionLabel ?? status}
                  </Pill>
                  {card?.capabilities?.backingSystem && (
                    <span className="font-mono text-[11px] text-ink-muted">
                      {card.capabilities.backingSystem}
                    </span>
                  )}
                </span>
              ) : cardLoading ? (
                <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                  <CircleNotch size={12} className="animate-spin" /> probing
                </span>
              ) : null
            }
          />
          {cardError && (
            <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <Warning size={14} weight="bold" className="mr-1 inline" />
              {cardError}
            </div>
          )}
          {card?.description && (
            <p className="text-sm text-ink-muted">{card.description}</p>
          )}
          {card?.capabilities?.executionDescription && (
            <p className="mt-2 text-xs text-ink-subtle">
              {card.capabilities.executionDescription}
            </p>
          )}
          {card?.skills && card.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {card.skills.slice(0, 8).map((skill, idx) => (
                <span
                  key={`${skill.id ?? skill.name ?? idx}`}
                  className="rounded-full bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-ink-muted"
                  title={skill.description}
                >
                  {skill.name ?? skill.id ?? "skill"}
                </span>
              ))}
            </div>
          )}
          {status === "mock_unconnected" || status === "needs_vendor_a2a_endpoint" ? (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <ShieldCheck size={12} weight="fill" className="mr-1 inline" />
              The bridge will return a failed task — Arbor refuses to substitute
              a placeholder for unconnected agents.
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Transcript"
            meta={
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted">{turns.length} turns</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={turns.length === 0 || busy}
                  onClick={clearAgentHistory}
                >
                  Clear
                </Button>
              </div>
            }
          />
          <div
            ref={transcriptRef}
            className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl bg-surface-subtle p-3"
          >
            {turns.length === 0 && (
              <p className="text-sm text-ink-muted">
                No messages yet. Send a prompt below to talk to{" "}
                <span className="font-mono">{selected ?? "an agent"}</span> via
                its A2A bridge.
              </p>
            )}
            {turns.map((turn) => (
              <Turn key={turn.id} turn={turn} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-ink-muted">
              task_type
              <input
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="ml-2 w-32 rounded-lg border border-line bg-white px-2 py-1 font-mono text-xs text-ink focus:border-brand-600 focus:outline-none"
              />
            </label>
            <span className="text-xs text-ink-subtle">
              method <span className="font-mono">message/send</span>
            </span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={
              selected
                ? selected === "codex-writer"
                  ? "Ask codex-writer for a scoped repo change. Shift+Enter for newline, Enter to send."
                  : `Ask ${selected} something. Shift+Enter for newline, Enter to send.`
                : "Select an agent on the left."
            }
            rows={3}
            disabled={!selected || busy}
            className="mt-2 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:outline-none focus:shadow-ring disabled:cursor-not-allowed disabled:bg-surface-subtle"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              disabled={!selected || !prompt.trim() || busy}
              onClick={() => void send()}
            >
              {busy ? (
                <CircleNotch size={14} className="animate-spin" />
              ) : (
                <PaperPlaneTilt size={14} weight="bold" />
              )}
              {busy ? "Sending" : "Send"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  const pending = turn.state === undefined;
  const failed = turn.state === "failed" || turn.state === "error";
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-white px-3 py-2 text-sm shadow-hairline">
        <div className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
          you · task_type {turn.taskType}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-ink">{turn.prompt}</p>
      </div>
      <div
        className={cn(
          "rounded-xl px-3 py-2 text-sm shadow-hairline",
          pending
            ? "bg-brand-50 text-brand-700"
            : failed
              ? "bg-rose-50 text-rose-800"
              : "bg-white text-ink",
        )}
      >
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
          <span>{turn.agent_id}</span>
          {pending ? (
            <span className="inline-flex items-center gap-1">
              <CircleNotch size={10} className="animate-spin" /> waiting
            </span>
          ) : (
            <>
              <span>{turn.state}</span>
              {turn.elapsedMs !== undefined && (
                <span>· {(turn.elapsedMs / 1000).toFixed(2)}s</span>
              )}
            </>
          )}
        </div>
        {turn.errorMessage && (
          <p className="mt-1 whitespace-pre-wrap font-mono text-xs">
            {turn.errorMessage}
          </p>
        )}
        {turn.text && (
          <pre className="mt-1 max-h-[260px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {turn.text}
          </pre>
        )}
      </div>
    </div>
  );
}

function extractText(result?: A2ATaskResult): string {
  if (!result) return "";
  const artifactText = result.artifacts
    ?.flatMap((a) => a.parts ?? [])
    .map((part) => {
      if (typeof part.text === "string") return part.text;
      if (part.data !== undefined) return JSON.stringify(part.data, null, 2);
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
  if (artifactText) return artifactText;
  const statusText = result.status?.message?.parts
    ?.map((p) => p.text)
    .filter((t): t is string => Boolean(t))
    .join("\n");
  if (statusText) return statusText;
  return JSON.stringify(result, null, 2);
}
