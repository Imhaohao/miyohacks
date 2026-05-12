"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatCredits } from "@/lib/payments";

interface ApiKeyResponse {
  token?: string;
  error?: string;
}

type ApiKeyRow = Omit<Doc<"user_api_keys">, "token_hash">;

export function AccountClient() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.accounts.me, isAuthenticated ? {} : "skip");
  const wallet = useQuery(api.payments.myWallet, isAuthenticated ? {} : "skip");
  const apiKeys = useQuery(
    api.apiKeys.listMine,
    isAuthenticated ? {} : "skip",
  );
  const revoke = useMutation(api.apiKeys.revokeMine);
  const [keyName, setKeyName] = useState("Local agent");
  const [projectId, setProjectId] = useState<string>("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createKey() {
    setBusy(true);
    setMessage(null);
    setNewToken(null);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: keyName,
          project_id: projectId || undefined,
        }),
      });
      const json = (await res.json()) as ApiKeyResponse;
      if (!res.ok || !json.token) {
        throw new Error(json.error ?? "Unable to create API key");
      }
      setNewToken(json.token);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const projects = (me?.projects ?? []) as Doc<"projects">[];
  const keys = (apiKeys ?? []) as ApiKeyRow[];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Account"
          meta={<Pill tone="success">OAuth secured</Pill>}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Account ID" value={me?.account?.account_id ?? "..."} />
          <Metric
            label="Available credits"
            value={formatCredits(wallet?.available_credits ?? 0)}
          />
          <Metric
            label="Trial granted"
            value={formatCredits(wallet?.lifetime_granted ?? 0)}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Agent API keys" meta="For MCP and A2A clients" />
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={keyName}
            onChange={(event) => setKeyName(event.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-600 focus:outline-none focus:shadow-ring"
            placeholder="API key name"
          />
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-600 focus:outline-none focus:shadow-ring"
          >
            <option value="">Default project</option>
            {projects.map((project: Doc<"projects">) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
          <Button type="button" onClick={createKey} disabled={busy}>
            {busy ? "Creating..." : "Create key"}
          </Button>
        </div>

        {newToken && (
          <div className="mt-4 rounded-xl bg-surface-subtle p-3">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">
              Save this token now
            </div>
            <code className="mt-2 block break-all font-mono text-sm text-ink">
              {newToken}
            </code>
          </div>
        )}

        {message && <p className="mt-3 text-sm text-rose-700">{message}</p>}

        <div className="mt-5 space-y-2">
          {keys.map((key: ApiKeyRow) => (
            <div
              key={key._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-subtle px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-ink">{key.name}</div>
                <div className="font-mono text-xs text-ink-muted">
                  {key.revoked_at ? "revoked" : "active"} · created{" "}
                  {new Date(key.created_at).toLocaleDateString()}
                </div>
              </div>
              {!key.revoked_at && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    revoke({ api_key_id: key._id as Id<"user_api_keys"> })
                  }
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-subtle p-3">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </div>
      <div className="mt-1 break-all font-mono text-sm text-ink">{value}</div>
    </div>
  );
}
