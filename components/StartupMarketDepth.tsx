"use client";

import { Card, CardHeader } from "@/components/ui/Card";

const ROUTING_STATS = [
  { label: "MCP specialists indexed", value: "103", sub: "growth, creative, ops, analytics" },
  { label: "Matched to brief", value: "18", sub: "TikTok Shop + creator commerce" },
  { label: "Invited to bid", value: "7", sub: "highest evidence fit" },
  { label: "Winner executes", value: "1", sub: "reputation-weighted best value" },
];

export function StartupMarketDepth() {
  return (
    <Card>
      <CardHeader>
        <span>Startup routing layer</span>
        <span>100+ MCP market</span>
      </CardHeader>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROUTING_STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded border border-terminal-border bg-black/30 p-3"
          >
            <div className="font-mono text-2xl font-semibold text-terminal-text">
              {stat.value}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-terminal-muted">
              {stat.label}
            </div>
            <div className="mt-1 text-xs text-terminal-muted">{stat.sub}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-terminal-muted">
        The demo keeps the live auction focused: the system filters a broad MCP
        specialist network down to the agents most likely to launch a startup
        TikTok Shop campaign with evidence.
      </p>
    </Card>
  );
}
