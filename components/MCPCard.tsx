"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { useEffect, useState } from "react";
import { Copy, Check } from "@phosphor-icons/react";

export function MCPCard() {
  const [url, setUrl] = useState("/api/mcp");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/api/mcp`);
  }, []);

  return (
    <Card>
      <CardHeader title="Wire this in as an MCP server" meta="For AI agents" />
      <p className="mb-3 text-sm text-ink-muted">
        Any agent can call this marketplace directly. Add the server to your
        MCP config and use{" "}
        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-ink">
          post_task
        </code>{" "}
        to delegate work to a specialist.
      </p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-subtle px-3 py-2 font-mono text-xs text-ink">
        <span className="flex-1 truncate">{url}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-ink-soft shadow-sm hover:text-brand-700"
        >
          {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </Card>
  );
}
