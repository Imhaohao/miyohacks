"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import type { LifecycleEventDoc } from "@/lib/task-view";

interface Props {
  events: LifecycleEventDoc[];
  taskId: string;
}

interface AddedPayload {
  tool?: string;
  mode?: string;
  source_kind?: "indexed_sources" | "web_research";
  char_count?: number;
  document_count?: number;
  duration_ms: number;
  summary_preview: string;
}

interface SkippedPayload {
  reason: string;
}

interface RequestNeededPayload {
  searched: string[];
  task_prompt: string;
  message: string;
}

interface UserProvidedPayload {
  preview: string;
  char_count: number;
}

export function ContextEnrichmentPanel({ events, taskId }: Props) {
  const hyperspellStarted = events.find(
    (e) => e.event_type === "hyperspell_business_context_started",
  );
  const hyperspellAdded = events.find(
    (e) => e.event_type === "hyperspell_business_context_added",
  );
  const hyperspellSkipped = events.find(
    (e) => e.event_type === "hyperspell_business_context_skipped",
  );
  const niaStarted = events.find(
    (e) => e.event_type === "nia_repo_context_started",
  );
  const niaAdded = events.find((e) => e.event_type === "nia_repo_context_added");
  const niaSkipped = events.find(
    (e) => e.event_type === "nia_repo_context_skipped",
  );
  const requestNeeded = events.find(
    (e) => e.event_type === "context_request_needed",
  );
  const userProvided = events.find(
    (e) => e.event_type === "context_user_provided",
  );

  const started = hyperspellStarted ?? niaStarted;
  const done =
    (hyperspellAdded || hyperspellSkipped || !hyperspellStarted) &&
    (niaAdded || niaSkipped || !niaStarted);

  const elapsed = useElapsedSeconds(
    started && !done ? started.timestamp : undefined,
  );

  if (
    !started &&
    !hyperspellAdded &&
    !hyperspellSkipped &&
    !niaAdded &&
    !niaSkipped
  ) {
    return null;
  }

  // Both platforms came back empty and the user hasn't filled the gap yet.
  if (requestNeeded && !userProvided) {
    const payload = requestNeeded.payload as unknown as RequestNeededPayload;
    return <ContextRequestForm payload={payload} taskId={taskId} />;
  }

  if (done) {
    const hyperspell = hyperspellAdded?.payload as unknown as
      | AddedPayload
      | undefined;
    const nia = niaAdded?.payload as unknown as AddedPayload | undefined;
    const skipped =
      ((hyperspellSkipped ?? niaSkipped)?.payload as unknown as
        | SkippedPayload
        | undefined) ?? null;
    const userCtx = userProvided?.payload as unknown as
      | UserProvidedPayload
      | undefined;
    return (
      <Card className="animate-fade-up bg-sky-50/40">
        <CardHeader
          title="Context"
          meta={<Pill tone="info">Hyperspell + Nia</Pill>}
        />
        <div className="space-y-3">
          {hyperspell && (
            <ContextBlock
              title={`Hyperspell · workspace memory · ${(hyperspell.duration_ms / 1000).toFixed(1)}s`}
              body={
                hyperspell.summary_preview ||
                `${hyperspell.document_count ?? 0} memory documents matched.`
              }
            />
          )}
          {nia && (
            <ContextBlock
              title={
                nia.source_kind === "indexed_sources"
                  ? `Nia · indexed sources · ${(nia.duration_ms / 1000).toFixed(1)}s`
                  : `Nia · web research (no indexed match) · ${(nia.duration_ms / 1000).toFixed(1)}s`
              }
              body={
                nia.summary_preview ||
                `${(nia.char_count ?? 0).toLocaleString()} chars retrieved.`
              }
            />
          )}
          {userCtx && (
            <ContextBlock
              title="You added"
              body={userCtx.preview}
            />
          )}
          {!hyperspell && !nia && !userCtx && skipped && (
            <p className="text-xs text-ink-muted">{skipped.reason}</p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-up bg-sky-50/40">
      <CardHeader
        title="Looking for context"
        meta={<Pill tone="info" pulse>Searching</Pill>}
      />
      <LoadingProgress
        label="Hyperspell + Nia are checking your sources"
        status="Hyperspell scans your connected workspace memory; Nia searches your indexed repos and docs."
        details={[
          "If we find something relevant, the auction opens with it pre-loaded.",
          "If we find nothing, we'll ask you to fill in the gap before bidding.",
        ]}
        elapsedSeconds={elapsed}
        tone="info"
      />
    </Card>
  );
}

function ContextBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink">{title}</p>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-sans text-xs text-ink-soft">
        {body}
      </pre>
    </div>
  );
}

function ContextRequestForm({
  payload,
  taskId,
}: {
  payload: RequestNeededPayload;
  taskId: string;
}) {
  const provide = useAction(api.userContext.provide);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await provide({ task_id: taskId as Id<"tasks">, text });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <Card className="animate-fade-up bg-amber-50/60">
      <CardHeader
        title="We need a bit more context"
        meta={<Pill tone="warning">Awaiting input</Pill>}
      />
      <p className="mb-4 text-sm leading-relaxed text-ink-soft">
        {payload.message}
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. User analytics live in Mixpanel; the only deploy on Tuesday was a checkout refactor at 4pm PT; sign-up funnel is at /onboard."
          required
          rows={5}
          className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:outline-none focus:shadow-ring"
        />
        <p className="text-xs text-ink-muted">
          We&rsquo;ll save this to your Hyperspell workspace so future tasks can
          find it without asking.
        </p>
        <Button
          type="submit"
          disabled={submitting || !text.trim()}
          className="w-full"
          size="lg"
        >
          {submitting ? (
            <>
              <CircleNotch size={16} className="animate-spin" weight="bold" />
              Saving and opening the auction…
            </>
          ) : (
            <>
              Add context and continue
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
  );
}
