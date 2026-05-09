"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { REACHER_DEMO_SIGNALS } from "@/lib/campaign-context";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function CampaignEvidencePanel() {
  return (
    <Card className="animate-fade-up">
      <CardHeader title="Reacher + Nia evidence" meta="Grounding layer" />
      <div className="grid gap-2.5 md:grid-cols-2">
        {REACHER_DEMO_SIGNALS.map((creator) => (
          <div
            key={creator.handle}
            className="rounded-xl border border-line bg-surface-subtle p-3 transition-colors hover:border-line-strong hover:bg-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-sm text-ink">
                  {creator.handle}
                </div>
                <div className="text-xs text-ink-muted">{creator.niche}</div>
              </div>
              <div className="text-right text-xs">
                <div className="font-mono text-brand-700">
                  {Math.round(creator.audienceFit * 100)}% fit
                </div>
                <div className="font-mono text-ink-muted">
                  {usd.format(creator.gmv30d)} GMV
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
              <span>{creator.avgVideoViews.toLocaleString("en-US")} views</span>
              <span>·</span>
              <span>
                {Math.round(creator.sampleAcceptanceRate * 100)}% sample
              </span>
              <span>·</span>
              <span>Risk {creator.risk}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-muted">
        Reacher supplies TikTok Shop creator, video, GMV, sample, and risk
        signals. Nia supplies campaign memory and brand-context constraints used
        by the agents and judge.
      </p>
    </Card>
  );
}
