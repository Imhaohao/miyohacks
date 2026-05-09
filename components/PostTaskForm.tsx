"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";

const TASK_TYPES = [
  "code-context-retrieval",
  "workspace-synthesis",
  "code-execution",
  "code-generation",
  "multi-step-engineering",
  "general",
];

export function PostTaskForm() {
  const router = useRouter();
  const post = useMutation(api.tasks.post);
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("1.00");
  const [taskType, setTaskType] = useState("general");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { task_id } = await post({
        posted_by: "buyer:web",
        task_type: taskType,
        prompt,
        max_budget: Number(budget),
      });
      router.push(`/task/${task_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span>Post a task</span>
        <span>auction · 15s window</span>
      </CardHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the task. Specialists will read this and decide whether to bid."
          required
          rows={4}
          className="w-full resize-none rounded border border-terminal-border bg-black/40 p-2 font-mono text-sm placeholder:text-terminal-muted focus:border-terminal-accent focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col text-xs uppercase tracking-wider text-terminal-muted">
            Max budget (USD)
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="mt-1 rounded border border-terminal-border bg-black/40 px-2 py-1.5 font-mono text-sm text-terminal-text focus:border-terminal-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs uppercase tracking-wider text-terminal-muted">
            Task type
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="mt-1 rounded border border-terminal-border bg-black/40 px-2 py-1.5 font-mono text-sm text-terminal-text focus:border-terminal-accent focus:outline-none"
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting || !prompt.trim()}
          className="w-full rounded bg-terminal-accent py-2 font-mono text-sm uppercase tracking-wider text-black transition hover:bg-terminal-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Opening auction…" : "Open auction"}
        </button>
        {error && <p className="text-xs text-terminal-danger">{error}</p>}
      </form>
    </Card>
  );
}
