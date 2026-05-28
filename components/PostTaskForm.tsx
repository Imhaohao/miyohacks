"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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

type IntakeId = Id<"task_intakes">;

interface IntakeActionResult {
  intake_id: IntakeId;
  status: "collecting" | "ready";
  questions?: string[];
  final_prompt?: string | null;
  last_error?: string;
}

interface IntakeDoc {
  status: "collecting" | "ready" | "posting" | "posted" | "failed";
  final_prompt?: string;
  posted_task_id?: Id<"tasks">;
  last_error?: string;
}

interface IntakeMessage {
  role: "user" | "assistant" | "system";
  kind: "initial_prompt" | "questions" | "answer" | "final_brief" | "error";
  text: string;
  questions?: string[];
}

export function PostTaskForm() {
  const router = useRouter();
  const startIntake = useAction(api.intake.start);
  const answerIntake = useAction(api.intake.answer);
  const approveIntake = useAction(api.intake.approveAndPost);
  const productContext = useQuery(api.productContext.latest, {
    owner_id: "buyer:web",
  });
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("2.00");
  const [intakeId, setIntakeId] = useState<IntakeId | null>(null);
  const intake = useQuery(
    api.intake.get,
    intakeId ? { intake_id: intakeId } : "skip",
  ) as IntakeDoc | null | undefined;
  const messages = useQuery(
    api.intake.messages,
    intakeId ? { intake_id: intakeId } : "skip",
  ) as IntakeMessage[] | undefined;
  const [answer, setAnswer] = useState("");
  const [finalDraft, setFinalDraft] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (finalDraft === null && intake?.final_prompt) {
      setFinalDraft(intake.final_prompt);
    }
  }, [finalDraft, intake?.final_prompt]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const max_budget = Number(budget);
    if (!prompt.trim()) return;
    if (!Number.isFinite(max_budget) || max_budget <= 0) {
      setError("Budget must be greater than zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = (await startIntake({
        owner_id: "buyer:web",
        task_type: DEFAULT_TASK_TYPE,
        prompt,
        max_budget,
      })) as IntakeActionResult;
      setIntakeId(result.intake_id);
      if (result.final_prompt) {
        setFinalDraft(result.final_prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!intakeId || answering || !answer.trim()) return;
    setAnswering(true);
    setError(null);
    try {
      const result = (await answerIntake({
        intake_id: intakeId,
        answer,
      })) as IntakeActionResult;
      setAnswer("");
      if (result.final_prompt) {
        setFinalDraft(result.final_prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnswering(false);
    }
  }

  async function approveFinalBrief() {
    if (!intakeId || posting) return;
    const final_prompt = finalDraft?.trim();
    if (!final_prompt) {
      setError("Final brief cannot be empty.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const result = (await approveIntake({
        intake_id: intakeId,
        final_prompt,
      })) as { task_id: Id<"tasks"> };
      router.push(`/task/${result.task_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPosting(false);
    }
  }

  function applyExample(ex: (typeof EXAMPLES)[number]) {
    setPrompt(ex.prompt);
  }

  const latestQuestions =
    messages
      ?.filter((message) => message.kind === "questions")
      .at(-1)?.questions ?? [];
  const loadingIntake =
    intakeId !== null && (intake === undefined || messages === undefined);
  const showQuestions =
    intake?.status === "collecting" && latestQuestions.length > 0;
  const showFinalBrief =
    intake?.status === "ready" ||
    intake?.status === "posting" ||
    intake?.status === "posted" ||
    intake?.status === "failed";

  return (
    <div className="space-y-4">
      {!intakeId && (
        <Card>
          <CardHeader
            title="What do you need done?"
            meta={
              productContext
                ? `Using ${productContext.company_name} context`
                : "Specialists respond in seconds"
            }
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
                <span className="self-center text-xs text-ink-subtle">Try</span>
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
                  Refining your request…
                </>
              ) : (
                <>
                  Shape the task brief
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
      )}

      {loadingIntake && (
        <Card>
          <CardHeader title="Refining your request" meta="Preparing intake" />
          <div className="space-y-2">
            <div className="shimmer h-3 w-full rounded" />
            <div className="shimmer h-3 w-5/6 rounded" />
            <div className="shimmer h-3 w-2/3 rounded" />
          </div>
        </Card>
      )}

      {showQuestions && (
        <Card>
          <CardHeader title="Clarify the task" meta="Pre-auction intake" />
          <ol className="mb-4 space-y-2">
            {latestQuestions.map((question, index) => (
              <li
                key={`${question}-${index}`}
                className="rounded-xl bg-surface-subtle p-3 text-sm text-ink"
              >
                <span className="mr-2 font-mono text-xs text-ink-subtle">
                  {index + 1}
                </span>
                {question}
              </li>
            ))}
          </ol>
          <form onSubmit={submitAnswer} className="space-y-3">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Add the missing details, constraints, examples, and success criteria."
              required
              rows={5}
              className={`${inputBase} resize-none leading-relaxed`}
            />
            <Button
              type="submit"
              disabled={answering || !answer.trim()}
              className="w-full"
              size="lg"
            >
              {answering ? (
                <>
                  <CircleNotch size={16} className="animate-spin" weight="bold" />
                  Updating the brief…
                </>
              ) : (
                <>
                  Update the brief
                  <ArrowRight size={16} weight="bold" />
                </>
              )}
            </Button>
          </form>
        </Card>
      )}

      {showFinalBrief && (
        <Card>
          <CardHeader
            title="Task brief"
            meta={intake.status === "posted" ? "Posted" : "Ready for auction"}
          />
          {intake.last_error && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Automatic intake fell back to manual review: {intake.last_error}
            </p>
          )}
          <textarea
            value={finalDraft ?? ""}
            onChange={(e) => setFinalDraft(e.target.value)}
            rows={9}
            disabled={posting || intake.status === "posting" || intake.status === "posted"}
            className={`${inputBase} resize-none leading-relaxed`}
          />
          <Button
            type="button"
            onClick={approveFinalBrief}
            disabled={
              posting ||
              intake.status === "posting" ||
              intake.status === "posted" ||
              !(finalDraft ?? "").trim()
            }
            className="mt-4 w-full"
            size="lg"
          >
            {posting || intake.status === "posting" ? (
              <>
                <CircleNotch size={16} className="animate-spin" weight="bold" />
                Posting to auction…
              </>
            ) : intake.status === "posted" ? (
              "Task posted"
            ) : (
              <>
                Post to auction
                <ArrowRight size={16} weight="bold" />
              </>
            )}
          </Button>
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </Card>
      )}

      <AgentSuggestions prompt={prompt} taskType={DEFAULT_TASK_TYPE} />
    </div>
  );
}
