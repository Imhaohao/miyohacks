import type { ImplementationPlanArtifact } from "@/lib/types";

export function ImplementationPlanProduct({
  artifact,
}: {
  artifact: ImplementationPlanArtifact;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded border border-terminal-accent/40 bg-terminal-accent/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-terminal-muted">
              approval plan
            </div>
            <h3 className="mt-1 text-lg font-semibold text-terminal-text">
              {artifact.title}
            </h3>
          </div>
          <div className="rounded bg-terminal-accent/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-terminal-accent">
            plan first, execute after approval
          </div>
        </div>
        <p className="mt-3 text-sm text-terminal-muted">{artifact.summary}</p>
      </div>

      <section>
        <SectionTitle title="Context Relay" meta="Hyperspell + Nia contract" />
        <div className="grid gap-2 md:grid-cols-2">
          {artifact.context_required.map((item) => (
            <div
              key={`${item.owner}-${item.item}`}
              className="rounded border border-terminal-border bg-black/30 p-3"
            >
              <div className="font-mono text-xs uppercase tracking-wider text-terminal-accent">
                {item.owner}
              </div>
              <div className="mt-2 text-sm text-terminal-text">{item.item}</div>
              <p className="mt-1 text-xs leading-5 text-terminal-muted">
                {item.why}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Build Plan" meta="what the agent will execute" />
        <div className="space-y-2">
          {artifact.proposed_build.map((step) => (
            <div
              key={step.step}
              className="rounded border border-terminal-border bg-black/30 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs text-terminal-accent">
                    step {step.step}
                  </div>
                  <h4 className="mt-1 text-sm font-semibold text-terminal-text">
                    {step.title}
                  </h4>
                </div>
                <div className="flex flex-wrap gap-1">
                  {step.files_or_surfaces.slice(0, 4).map((surface) => (
                    <span
                      key={surface}
                      className="rounded bg-terminal-border px-2 py-0.5 font-mono text-[10px] text-terminal-muted"
                    >
                      {surface}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-terminal-muted">
                {step.deliverable}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <SectionTitle title="Acceptance Criteria" meta="definition of done" />
          <div className="space-y-2">
            {artifact.acceptance_criteria.map((criterion) => (
              <div
                key={criterion}
                className="rounded border border-terminal-border bg-black/30 px-3 py-2 text-xs text-terminal-text"
              >
                {criterion}
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title="Refinement Questions" meta="ask the planner" />
          <div className="space-y-2">
            {artifact.user_questions.map((question) => (
              <div
                key={question}
                className="rounded border border-terminal-warn/30 bg-terminal-warn/5 px-3 py-2 text-xs text-terminal-text"
              >
                {question}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <SectionTitle title="Payment Checkpoint" meta="before execution" />
        <div className="rounded border border-terminal-accent/30 bg-black/30 p-3 text-xs text-terminal-muted">
          {artifact.payment_checkpoint.reason}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h4 className="text-xs uppercase tracking-[0.22em] text-terminal-text">
        {title}
      </h4>
      <span className="text-[10px] uppercase tracking-wider text-terminal-muted">
        {meta}
      </span>
    </div>
  );
}
