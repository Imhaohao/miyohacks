"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { AgentSuggestions } from "@/components/AgentSuggestions";
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  GitBranch,
  WarningCircle,
} from "@phosphor-icons/react";
import { CURRENT_BUYER_ID } from "@/lib/current-user";
import {
  isSoftwareEngineeringTask,
  requiredContextForPrompt,
  type RequiredContext,
} from "@/lib/context-readiness";

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
  const productContext = useQuery(api.productContext.latest, {
    owner_id: CURRENT_BUYER_ID,
  });
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
        posted_by: CURRENT_BUYER_ID,
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

  const contextReadiness =
    productContext === undefined
      ? undefined
      : getContextReadiness(productContext ?? null);
  const requiredContext = requiredContextForPrompt(prompt);
  const needsRepoContext = requiredContext.includes("nia_repo");
  const likelySoftwareTask = isSoftwareEngineeringTask(prompt);
  const missingBusinessContext =
    contextReadiness !== undefined && !contextReadiness.has_business_context;
  const missingRepoContext =
    needsRepoContext &&
    contextReadiness !== undefined &&
    !contextReadiness.has_repo_context;
  const missingContext = missingBusinessContext || missingRepoContext;
  const disableSubmit =
    submitting ||
    !prompt.trim() ||
    contextReadiness === undefined ||
    missingContext;

  return (
    <div className="space-y-4">
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
          <RequiredContextPanel
            readiness={contextReadiness}
            requiredContext={requiredContext}
            likelySoftwareTask={likelySoftwareTask}
          />
          <div>
            <label htmlFor="budget" className={fieldLabel}>
              Budget
            </label>
            <div className="flex flex-wrap items-end gap-3">
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
              <div className="pb-2 text-xs text-ink-muted">
                Credits are checked when the task starts.
              </div>
            </div>
          </div>
          <Button
            type="submit"
            disabled={disableSubmit}
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
          {missingContext && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Connect Hyperspell/Nia context first so agents can diagnose with
              your project context.
            </p>
          )}
        </form>
      </Card>
      <AgentSuggestions prompt={prompt} taskType={DEFAULT_TASK_TYPE} />
    </div>
  );
}

type ContextReadiness = {
  has_profile: boolean;
  has_business_context: boolean;
  has_repo_context: boolean;
  hyperspell_status: string;
  nia_status: string;
  missing_required_context: string[];
};

type ProductContextProfile = {
  company_name?: string;
  business_context?: string;
  github_repo_url?: string;
  repo_context?: string;
  source_hints?: string[];
  hyperspell_status?: string;
} | null;

function getContextReadiness(profile: ProductContextProfile): ContextReadiness {
  const hasBusinessContext = Boolean(
    profile?.company_name?.trim() && profile?.business_context?.trim(),
  );
  const hasRepoContext = Boolean(
    profile?.github_repo_url?.trim() ||
      profile?.repo_context?.trim() ||
      (profile?.source_hints ?? []).some((hint) => hint.trim()),
  );

  return {
    has_profile: Boolean(profile),
    has_business_context: hasBusinessContext,
    has_repo_context: hasRepoContext,
    hyperspell_status: profile?.hyperspell_status ?? "not_configured",
    nia_status: hasRepoContext ? "ready" : "missing",
    missing_required_context: [
      ...(hasBusinessContext ? [] : ["hyperspell"]),
      ...(hasRepoContext ? [] : ["nia_repo"]),
    ],
  };
}

function RequiredContextPanel({
  readiness,
  requiredContext,
  likelySoftwareTask,
}: {
  readiness: ContextReadiness | undefined;
  requiredContext: RequiredContext[];
  likelySoftwareTask: boolean;
}) {
  const businessReady = Boolean(readiness?.has_business_context);
  const repoReady = Boolean(readiness?.has_repo_context);
  const repoRequired = requiredContext.includes("nia_repo");

  return (
    <div className="rounded-xl border border-line bg-surface-subtle p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">
            Required context
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {likelySoftwareTask
              ? "Software tasks need project memory and repo/source context before diagnosis."
              : "Project memory helps agents route and diagnose the task correctly."}
          </p>
        </div>
        <GitBranch size={18} weight="bold" className="mt-0.5 text-brand-700" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ContextStatusRow
          label="Hyperspell business memory"
          status={
            readiness === undefined
              ? "Checking"
              : businessReady
                ? readiness.hyperspell_status === "pending"
                  ? "Syncing"
                  : "Ready"
                : "Missing"
          }
          ready={businessReady}
          required
        />
        <ContextStatusRow
          label="Nia/GitHub repo context"
          status={
            readiness === undefined ? "Checking" : repoReady ? "Ready" : "Missing"
          }
          ready={repoReady}
          required={repoRequired}
        />
      </div>
      {!readiness?.has_profile && readiness !== undefined && (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-ink-muted">
          Start by saving the product context card on the left.
        </p>
      )}
    </div>
  );
}

function ContextStatusRow({
  label,
  status,
  ready,
  required,
}: {
  label: string;
  status: string;
  ready: boolean;
  required: boolean;
}) {
  const tone = ready
    ? "bg-emerald-50 text-emerald-700"
    : required
      ? "bg-amber-50 text-amber-700"
      : "bg-white text-ink-muted";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
      <span className="text-xs text-ink-muted">{label}</span>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${tone}`}
      >
        {ready ? (
          <CheckCircle size={12} weight="bold" />
        ) : required ? (
          <WarningCircle size={12} weight="bold" />
        ) : (
          <CircleNotch size={12} weight="bold" />
        )}
        {status}
      </span>
    </div>
  );
}
