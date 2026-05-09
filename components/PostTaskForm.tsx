"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { DEFAULT_CAMPAIGN_BRIEF } from "@/lib/campaign-context";

const TASK_TYPES = [
  { value: "startup-launch-plan", label: "Startup launch plan" },
  { value: "creator-scouting", label: "Creator scouting" },
  { value: "audience-fit-analysis", label: "Audience-fit analysis" },
  { value: "outreach-drafting", label: "Outreach drafting" },
  { value: "sample-request-creation", label: "Sample requests" },
  { value: "campaign-risk-evaluation", label: "Risk evaluation" },
  { value: "end-to-end-campaign", label: "End-to-end campaign" },
];

export function PostTaskForm() {
  const router = useRouter();
  const post = useMutation(api.tasks.post);
  const [prompt, setPrompt] = useState(DEFAULT_CAMPAIGN_BRIEF);
  const [budget, setBudget] = useState("2.00");
  const [taskType, setTaskType] = useState("startup-launch-plan");
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
        <span>Launch TikTok Shop</span>
        <span>15s agent auction</span>
      </CardHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-2 rounded border border-terminal-border bg-black/30 p-3 text-xs text-terminal-muted sm:grid-cols-3">
          <div>
            <div className="font-mono text-terminal-text">Seed-stage brand</div>
            <div>limited team, needs revenue this week</div>
          </div>
          <div>
            <div className="font-mono text-terminal-text">TikTok Shop</div>
            <div>creator GMV, samples, outreach</div>
          </div>
          <div>
            <div className="font-mono text-terminal-text">Auction routing</div>
            <div>100+ indexed, top agents invited</div>
          </div>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Paste a startup product launch brief. Specialists compete to scout TikTok Shop creators, evaluate fit, draft outreach, request samples, and flag risks."
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
                <option key={t.value} value={t.value}>
                  {t.label}
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
          {submitting ? "Opening startup launch auction..." : "Build TikTok Shop launch plan"}
        </button>
        {error && <p className="text-xs text-terminal-danger">{error}</p>}
      </form>
    </Card>
  );
}
