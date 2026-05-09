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
    <Card>
      <CardHeader>
        <span>Startup launch evidence</span>
        <span>Reacher + Nia</span>
      </CardHeader>
      <div className="grid gap-2 md:grid-cols-2">
        {REACHER_DEMO_SIGNALS.map((creator) => (
          <div
            key={creator.handle}
            className="rounded border border-terminal-border bg-black/30 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-sm text-terminal-text">
                  {creator.handle}
                </div>
                <div className="text-xs text-terminal-muted">
                  {creator.niche}
                </div>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-terminal-accent">
                  {Math.round(creator.audienceFit * 100)}% fit
                </div>
                <div className="text-terminal-muted">
                  {usd.format(creator.gmv30d)} GMV
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-terminal-muted">
              <span>{creator.avgVideoViews.toLocaleString("en-US")} views</span>
              <span>{Math.round(creator.sampleAcceptanceRate * 100)}% sample</span>
              <span>risk {creator.risk}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-terminal-muted">
        Reacher supplies TikTok Shop creator, video, GMV, sample, and risk
        signals. Nia supplies startup constraints: small team, fast first-week
        learning, practical founder-ready outreach, and brand-safe claims.
      </p>
    </Card>
  );
}
