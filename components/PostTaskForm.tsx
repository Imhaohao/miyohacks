"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { DEFAULT_CAMPAIGN_BRIEF } from "@/lib/campaign-context";

const TASK_TYPES = [
  "creator-scouting",
  "audience-fit-analysis",
  "outreach-drafting",
  "sample-request-creation",
  "campaign-risk-evaluation",
  "end-to-end-campaign",
];

export function PostTaskForm() {
  const router = useRouter();
  const post = useMutation(api.tasks.post);
  const [prompt, setPrompt] = useState(DEFAULT_CAMPAIGN_BRIEF);
  const [budget, setBudget] = useState("2.00");
  const [taskType, setTaskType] = useState("end-to-end-campaign");
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
        <span>Launch campaign auction</span>
        <span>15s sealed bids</span>
      </CardHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Paste a brand campaign brief. Specialists compete to scout creators, evaluate fit, draft outreach, request samples, and flag risks."
          required
          rows={4}
          className="w-full resize-none rounded border border-terminal-border bg-black/40 p-2 font-mono text-sm placeholder:text-terminal-muted focus:border-terminal-accent focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col text-xs uppercase tracking-wider text-terminal-muted">
            Campaign budget (simulated)
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
            Workflow
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
          {submitting ? "Opening campaign auction..." : "Run creator campaign auction"}
        </button>
        {error && <p className="text-xs text-terminal-danger">{error}</p>}
      </form>
    </Card>
  );
}
