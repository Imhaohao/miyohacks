"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { useState } from "react";

export function MCPCard() {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "/api/mcp";
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardHeader>
        <span>MCP endpoint</span>
        <span>for AI agents</span>
      </CardHeader>
      <p className="mb-3 text-xs text-terminal-muted">
        Other agents can call this auction directly. Add this server to your MCP
        config and call <span className="font-mono">post_task</span>.
      </p>
      <div className="flex items-center gap-2 rounded border border-terminal-border bg-black/40 px-2 py-1.5 font-mono text-xs">
        <span className="flex-1 truncate">{url}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="rounded bg-terminal-border px-2 py-0.5 text-[10px] uppercase tracking-wider hover:bg-terminal-accent hover:text-black"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </Card>
  );
}
