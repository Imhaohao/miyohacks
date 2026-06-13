"use client";

/**
 * Admin console: direct A2A chat with any registered specialist.
 *
 * Pick a specialist with an a2a_endpoint, send messages over the A2A
 * protocol (message/send via /api/admin/a2a-chat), and read replies.
 * contextId is threaded so multi-turn conversations stay coherent on
 * agents that support it.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArborMark } from "@/components/ui/ArborMark";
import { ArrowLeft, PaperPlaneTilt } from "@phosphor-icons/react";

interface A2ASpecialist {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  a2a_endpoint: string;
  discovered: boolean;
}

interface ChatTurn {
  role: "user" | "agent" | "system";
  text: string;
  state?: string;
  taskId?: string;
  raw?: unknown;
}

export default function AdminPage() {
  const [specialists, setSpecialists] = useState<A2ASpecialist[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [turnsByAgent, setTurnsByAgent] = useState<Record<string, ChatTurn[]>>({});
  const [contextByAgent, setContextByAgent] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [rawOpen, setRawOpen] = useState<number | null>(null);
  // Agents that declined for a missing API key — shows the paste-key form.
  const [keyPromptByAgent, setKeyPromptByAgent] = useState<Record<string, boolean>>({});
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/a2a-chat")
      .then((r) => r.json())
      .then((d) => {
        setSpecialists(d.specialists ?? []);
        if (d.specialists?.length) setSelected(d.specialists[0].agent_id);
      })
      .catch(() => setSpecialists([]));
  }, []);

  const turns = turnsByAgent[selected] ?? [];
  const spec = specialists.find((s) => s.agent_id === selected);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  function pushTurn(agentId: string, turn: ChatTurn) {
    setTurnsByAgent((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] ?? []), turn],
    }));
  }

  async function send() {
    const text = input.trim();
    if (!text || !selected || sending) return;
    const agentId = selected;
    setInput("");
    setSending(true);
    pushTurn(agentId, { role: "user", text });
    try {
      const res = await fetch("/api/admin/a2a-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          text,
          context_id: contextByAgent[agentId],
        }),
      });
      // The reply may be a gateway/HTML error page (timeout, 5xx) rather than
      // JSON — read text first and parse defensively so the user sees the real
      // status instead of a raw "Unexpected token '<'" parse crash.
      const bodyText = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let d: any;
      try {
        d = JSON.parse(bodyText);
      } catch {
        const snippet = bodyText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
        pushTurn(agentId, {
          role: "system",
          text: `Agent endpoint returned a non-JSON ${res.status} response${
            res.status === 504 || res.status === 502
              ? " (gateway timeout — the agent was too slow or unreachable)"
              : ""
          }${snippet ? `: ${snippet}` : ""}`,
        });
        return;
      }
      if (d.ok) {
        if (d.context_id) {
          setContextByAgent((prev) => ({ ...prev, [agentId]: d.context_id }));
        }
        pushTurn(agentId, {
          role: "agent",
          text: d.reply_text || "(empty reply)",
          state: d.state,
          taskId: d.task_id,
          raw: d.raw,
        });
      } else {
        if (d.needs_key) {
          setKeyPromptByAgent((prev) => ({ ...prev, [agentId]: true }));
        }
        pushTurn(agentId, {
          role: "system",
          text: d.error || "request failed",
          raw: d.raw,
        });
      }
    } catch (err) {
      pushTurn(agentId, {
        role: "system",
        text: err instanceof Error ? err.message : "network error",
      });
    } finally {
      setSending(false);
    }
  }

  async function saveKey() {
    const key = keyInput.trim();
    if (!key || !selected || savingKey) return;
    const agentId = selected;
    setSavingKey(true);
    try {
      const res = await fetch("/api/admin/a2a-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, api_key: key }),
      });
      const d = await res.json();
      if (d.ok) {
        setKeyInput("");
        setKeyPromptByAgent((prev) => ({ ...prev, [agentId]: false }));
        pushTurn(agentId, {
          role: "system",
          text: "API key saved to the Arbor key vault — send your message again.",
        });
      } else {
        pushTurn(agentId, {
          role: "system",
          text: `failed to save key: ${d.error || "unknown error"}`,
        });
      }
    } catch (err) {
      pushTurn(agentId, {
        role: "system",
        text: err instanceof Error ? err.message : "network error saving key",
      });
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-6 pb-12">
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

      <header className="mb-8 mt-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          A2A console
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-muted">
          Talk directly to any specialist reachable over the A2A protocol.
          Messages go out as real message/send calls to the agent&apos;s
          endpoint.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <aside>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            A2A specialists
          </h2>
          <ul className="space-y-1">
            {specialists.map((s) => (
              <li key={s.agent_id}>
                <button
                  onClick={() => setSelected(s.agent_id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    s.agent_id === selected
                      ? "bg-brand-700 text-white"
                      : "text-ink hover:bg-black/5"
                  }`}
                >
                  <span className="block font-medium">{s.display_name}</span>
                  <span
                    className={`block truncate text-xs ${
                      s.agent_id === selected ? "text-white/70" : "text-ink-muted"
                    }`}
                  >
                    {s.agent_id}
                    {s.discovered ? " (discovered)" : ""}
                  </span>
                </button>
              </li>
            ))}
            {specialists.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-muted">
                No A2A specialists registered.
              </li>
            )}
          </ul>
        </aside>

        <section className="flex min-h-[480px] flex-col rounded-xl border border-black/10 bg-white">
          <div className="border-b border-black/10 px-4 py-3">
            <p className="text-sm font-medium text-ink">
              {spec?.display_name ?? "Select a specialist"}
            </p>
            {spec && (
              <p className="truncate text-xs text-ink-muted" title={spec.a2a_endpoint}>
                {spec.a2a_endpoint}
              </p>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <p className="text-sm text-ink-muted">
                {spec
                  ? `Send a message to ${spec.display_name}. ${spec.one_liner}`
                  : "Pick a specialist on the left."}
              </p>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={t.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    t.role === "user"
                      ? "bg-brand-700 text-white"
                      : t.role === "agent"
                        ? "bg-black/5 text-ink"
                        : "border border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{t.text}</p>
                  {t.role === "agent" && (
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-muted">
                      {t.state && <span>state: {t.state}</span>}
                      {t.raw !== undefined && (
                        <button
                          className="underline hover:text-brand-700"
                          onClick={() => setRawOpen(rawOpen === i ? null : i)}
                        >
                          {rawOpen === i ? "hide raw" : "raw"}
                        </button>
                      )}
                    </div>
                  )}
                  {rawOpen === i && t.raw !== undefined && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/80 p-2 text-[11px] leading-snug text-green-200">
                      {JSON.stringify(t.raw, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <p className="text-xs text-ink-muted">
                Waiting for {spec?.display_name ?? "agent"}...
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {spec && keyPromptByAgent[selected] && (
            <form
              className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveKey();
              }}
            >
              <span className="text-xs font-medium text-amber-800">
                This agent needs an API key
              </span>
              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                type="password"
                placeholder="Paste API key"
                className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-brand-700"
              />
              <button
                type="submit"
                disabled={savingKey || !keyInput.trim()}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {savingKey ? "Saving..." : "Save key"}
              </button>
            </form>
          )}

          <form
            className="flex items-center gap-2 border-t border-black/10 px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={spec ? `Message ${spec.display_name}` : "Select a specialist first"}
              disabled={!spec || sending}
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm text-ink outline-none focus:border-brand-700 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!spec || sending || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
            >
              <PaperPlaneTilt size={14} weight="bold" />
              Send
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
