import type { ImplementationPlanArtifact } from "@/lib/types";

export function ImplementationPlanProduct({
  artifact,
}: {
  artifact: ImplementationPlanArtifact;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-100 bg-brand-50/80 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand-700">
              Approval plan
            </p>
            <h3 className="mt-1 text-lg font-semibold text-ink">{artifact.title}</h3>
          </div>
          <span className="rounded-full bg-brand-100 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-brand-800">
            Plan first · execute after approval
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {artifact.summary}
        </p>
      </div>

      <section>
        <SectionTitle title="Context relay" meta="Hyperspell + Nia contract" />
        <div className="grid gap-2 md:grid-cols-2">
          {artifact.context_required.map((item) => (
            <div
              key={`${item.owner}-${item.item}`}
              className="rounded-xl border border-line bg-surface-subtle p-3"
            >
              <div className="font-mono text-xs uppercase tracking-wider text-brand-700">
                {item.owner}
              </div>
              <div className="mt-2 text-sm font-medium text-ink">{item.item}</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {item.why}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Build plan" meta="what the agent will execute" />
        <div className="space-y-2">
          {artifact.proposed_build.map((step) => (
            <div
              key={step.step}
              className="rounded-xl border border-line bg-white p-3 shadow-hairline"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs text-brand-700">
                    Step {step.step}
                  </div>
                  <h4 className="mt-1 text-sm font-semibold text-ink">
                    {step.title}
                  </h4>
                </div>
                <div className="flex flex-wrap gap-1">
                  {step.files_or_surfaces.slice(0, 4).map((surface) => (
                    <span
                      key={surface}
                      className="rounded bg-surface-muted px-2 py-0.5 font-mono text-[10px] text-ink-muted"
                    >
                      {surface}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                {step.deliverable}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <SectionTitle title="Acceptance criteria" meta="definition of done" />
          <div className="space-y-2">
            {artifact.acceptance_criteria.map((criterion) => (
              <div
                key={criterion}
                className="rounded-xl border border-line bg-surface-subtle px-3 py-2 text-xs text-ink"
              >
                {criterion}
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title="Refinement questions" meta="ask the planner" />
          <div className="space-y-2">
            {artifact.user_questions.map((question) => (
              <div
                key={question}
                className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-ink"
              >
                {question}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <SectionTitle title="Payment checkpoint" meta="before execution" />
        <div className="rounded-xl border border-line bg-surface-subtle p-3 text-sm leading-relaxed text-ink-muted">
          {artifact.payment_checkpoint.reason}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink">
        {title}
      </h4>
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
        {meta}
      </span>
    </div>
  );
}
