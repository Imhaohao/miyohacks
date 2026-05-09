"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { AgentSuggestions } from "@/components/AgentSuggestions";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react";

// task_type is still used by some legacy code paths (the reacher-live-launch
// demo and the campaign-context evidence injection). For the human form we
// always post "general" and let the LLM ranker decide fit purely from the
// prompt — no category selector, no friction.
const DEFAULT_TASK_TYPE = "general";

const EXAMPLES: Array<{ label: string; prompt: string }> = [
  {
    label: "Set up Stripe Connect",
    prompt:
      "I need help setting up payments in my new AI agent marketplace. Not sure which payment platform to use or how to handle marketplace payouts. Recommend a stack and walk me through the integration steps.",
  },
  {
    label: "Design a landing page",
    prompt:
      "Design a clean landing page for a developer tool that explains the product in 10 seconds, has a clear CTA, and follows a modern, minimal aesthetic.",
  },
  {
    label: "Triage our backlog",
    prompt:
      "Look at the open issues in our project tracker and propose a priority order based on impact, urgency, and effort. Group them into next sprint vs. later.",
  },
  {
    label: "Launch a TikTok Shop",
    prompt:
      "Plan a TikTok Shop creator campaign for a clean-label electrolyte drink. Find high-fit creators, draft outreach, and flag risk.",
  },
];

const fieldLabel = "mb-1.5 block text-sm font-medium text-ink";
const inputBase =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:outline-none focus:shadow-ring";

export function PostTaskForm() {
  const router = useRouter();
  const post = useMutation(api.tasks.post);
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("2.00");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { task_id } = await post({
        posted_by: "buyer:web",
        task_type: DEFAULT_TASK_TYPE,
        prompt,
        max_budget: Number(budget),
      });
      router.push(`/task/${task_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  function applyExample(ex: (typeof EXAMPLES)[number]) {
    setPrompt(ex.prompt);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="What do you need done?"
          meta="Specialists respond in seconds"
        />
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="brief" className={fieldLabel}>
              Describe the work
            </label>
            <textarea
              id="brief"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Set up Stripe Connect for our marketplace, including onboarding, payouts, and refunds."
              required
              rows={5}
              className={`${inputBase} resize-none leading-relaxed`}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="self-center text-xs text-ink-subtle">
                Try
              </span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => applyExample(ex)}
                  className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-xs text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="budget" className={fieldLabel}>
              Budget
            </label>
            <div className="relative max-w-[160px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">
                $
              </span>
              <input
                id="budget"
                type="number"
                step="0.01"
                min="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className={`${inputBase} pl-6 font-mono`}
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={submitting || !prompt.trim()}
            className="w-full"
            size="lg"
          >
            {submitting ? (
              <>
                <CircleNotch size={16} className="animate-spin" weight="bold" />
                Finding your specialist…
              </>
            ) : (
              <>
                Find my specialist
                <ArrowRight size={16} weight="bold" />
              </>
            )}
          </Button>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </form>
      </Card>
      <AgentSuggestions prompt={prompt} taskType={DEFAULT_TASK_TYPE} />
    </div>
  );
}
