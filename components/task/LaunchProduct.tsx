import type { CampaignLaunchArtifact } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

export function LaunchProduct({ artifact }: { artifact: CampaignLaunchArtifact }) {
  const topCreators = artifact.creators.slice(0, 5);
  return (
    <div className="space-y-4">
      <div className="rounded border border-terminal-accent/40 bg-terminal-accent/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-terminal-muted">
              delivered product
            </div>
            <h3 className="mt-1 text-lg font-semibold text-terminal-text">
              {artifact.title}
            </h3>
          </div>
          <div className="rounded bg-terminal-accent/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-terminal-accent">
            ready to launch
          </div>
        </div>
        <p className="mt-3 text-sm text-terminal-muted">{artifact.summary}</p>
      </div>

      <section>
        <SectionTitle title="Creator Shortlist" meta="ranked by live Reacher GMV" />
        <div className="grid gap-2 md:grid-cols-2">
          {topCreators.map((creator) => (
            <div
              key={creator.handle}
              className="rounded border border-terminal-border bg-black/30 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-sm text-terminal-text">
                    #{creator.rank} {creator.handle}
                  </div>
                  <p className="mt-1 text-xs text-terminal-muted">
                    {creator.fit_reason}
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="text-terminal-accent">
                    {formatMoney(creator.gmv)}
                  </div>
                  <div className="text-terminal-muted">
                    {creator.followers.toLocaleString("en-US")} followers
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wider text-terminal-muted">
                <Metric label="units" value={creator.units_sold} />
                <Metric label="orders" value={creator.orders} />
                <Metric
                  label="commission"
                  value={formatMoney(creator.estimated_commission)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Outreach Drafts" meta="creator-specific copy" />
        <div className="grid gap-2 md:grid-cols-3">
          {artifact.outreach_drafts.map((draft) => (
            <div
              key={draft.handle}
              className="rounded border border-terminal-border bg-black/30 p-3"
            >
              <div className="mb-2 font-mono text-xs text-terminal-accent">
                {draft.handle}
              </div>
              <p className="line-clamp-6 text-xs leading-5 text-terminal-text">
                {draft.message}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <SectionTitle title="Sample Request Tasks" meta="operator checklist" />
          <div className="space-y-2">
            {artifact.sample_plan.map((item) => (
              <div
                key={item.task}
                className="flex items-center justify-between gap-3 rounded border border-terminal-border bg-black/30 px-3 py-2 text-xs"
              >
                <div>
                  <div className="text-terminal-text">{item.task}</div>
                  <div className="mt-0.5 text-terminal-muted">{item.owner}</div>
                </div>
                <span className="rounded bg-terminal-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-terminal-muted">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title="Risk Controls" meta="before samples ship" />
          <div className="space-y-2">
            {artifact.risk_flags.map((risk) => (
              <div
                key={risk}
                className="rounded border border-terminal-danger/30 bg-terminal-danger/5 px-3 py-2 text-xs text-terminal-text"
              >
                {risk}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <SectionTitle title="7-Day Launch Board" meta="what happens next" />
        <div className="grid gap-2 md:grid-cols-7">
          {artifact.launch_plan.map((day) => (
            <div
              key={day.day}
              className="rounded border border-terminal-border bg-black/30 p-3"
            >
              <div className="font-mono text-xs text-terminal-accent">
                day {day.day}
              </div>
              <p className="mt-2 text-xs leading-5 text-terminal-text">
                {day.action}
              </p>
              <div className="mt-3 border-t border-terminal-border pt-2 text-[10px] uppercase tracking-wider text-terminal-muted">
                {day.metric}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Evidence" meta="live MCP tool calls" />
        <div className="rounded border border-terminal-border bg-black/30 p-3 text-xs text-terminal-muted">
          <div className="flex flex-wrap gap-2">
            {artifact.evidence.tools_used.map((tool) => (
              <span
                key={tool}
                className="rounded bg-terminal-border px-2 py-1 font-mono text-[10px] text-terminal-text"
              >
                {tool}
              </span>
            ))}
          </div>
          <div className="mt-3">
            Window:{" "}
            <span className="font-mono text-terminal-text">
              {artifact.evidence.performance_window}
            </span>
          </div>
          <div className="mt-1">
            Shops: {artifact.evidence.shops_queried.join(", ") || "all accessible shops"}
          </div>
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div>{label}</div>
      <div className="font-mono text-terminal-text">{value}</div>
    </div>
  );
}
