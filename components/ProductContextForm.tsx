"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import {
  CheckCircle,
  CircleNotch,
  Database,
  WarningCircle,
} from "@phosphor-icons/react";

const OWNER_ID = "buyer:web";

const fieldLabel = "mb-1.5 block text-sm font-medium text-ink";
const inputBase =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:outline-none focus:shadow-ring";

function splitSourceHints(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function hyperspellStatus(status: string | undefined) {
  if (status === "seeded") {
    return {
      label: "Hyperspell memory ready",
      className: "bg-emerald-50 text-emerald-700",
      icon: <CheckCircle size={14} weight="bold" />,
    };
  }
  if (status === "pending") {
    return {
      label: "Syncing to Hyperspell",
      className: "bg-brand-50 text-brand-700",
      icon: <CircleNotch size={14} className="animate-spin" weight="bold" />,
    };
  }
  if (status === "failed") {
    return {
      label: "Hyperspell key failed",
      className: "bg-amber-50 text-amber-700",
      icon: <WarningCircle size={14} weight="bold" />,
    };
  }
  return {
    label: "Convex profile ready",
    className: "bg-surface-muted text-ink-muted",
    icon: <Database size={14} weight="bold" />,
  };
}

export function ProductContextForm() {
  const latest = useQuery(api.productContext.latest, { owner_id: OWNER_ID });
  const save = useMutation(api.productContext.save);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [businessContext, setBusinessContext] = useState("");
  const [repoContext, setRepoContext] = useState("");
  const [sourceHints, setSourceHints] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!latest || latest._id === loadedProfileId) return;
    setLoadedProfileId(latest._id);
    setCompanyName(latest.company_name);
    setProductUrl(latest.product_url ?? "");
    setGithubRepoUrl(latest.github_repo_url ?? "");
    setBusinessContext(latest.business_context);
    setRepoContext(latest.repo_context ?? "");
    setSourceHints(latest.source_hints.join("\n"));
  }, [latest, loadedProfileId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await save({
        owner_id: OWNER_ID,
        company_name: companyName,
        product_url: productUrl || undefined,
        github_repo_url: githubRepoUrl || undefined,
        business_context: businessContext,
        repo_context: repoContext || undefined,
        source_hints: splitSourceHints(sourceHints),
      });
      setMessage("Saved. Future tasks will carry this context automatically.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const status = hyperspellStatus(latest?.hyperspell_status);

  return (
    <Card className="h-fit">
      <CardHeader
        title="Connect product context"
        meta={
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${status.className}`}
          >
            {status.icon}
            {status.label}
          </span>
        }
      />
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="companyName" className={fieldLabel}>
              Product
            </label>
            <input
              id="companyName"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Arbor"
              required
              className={inputBase}
            />
          </div>
          <div>
            <label htmlFor="productUrl" className={fieldLabel}>
              Product URL
            </label>
            <input
              id="productUrl"
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              placeholder="https://tryarbor.vercel.app"
              className={inputBase}
            />
          </div>
        </div>

        <div>
          <label htmlFor="githubRepoUrl" className={fieldLabel}>
            GitHub repo
          </label>
          <input
            id="githubRepoUrl"
            value={githubRepoUrl}
            onChange={(event) => setGithubRepoUrl(event.target.value)}
            placeholder="https://github.com/Imhaohao/miyohacks"
            className={inputBase}
          />
        </div>

        <div>
          <label htmlFor="businessContext" className={fieldLabel}>
            What should Hyperspell know?
          </label>
          <textarea
            id="businessContext"
            value={businessContext}
            onChange={(event) => setBusinessContext(event.target.value)}
            placeholder="Who the customer is, what the product does, positioning, constraints, and what outcomes matter."
            required
            rows={4}
            className={`${inputBase} resize-none leading-relaxed`}
          />
        </div>

        <div>
          <label htmlFor="repoContext" className={fieldLabel}>
            What should Nia inspect?
          </label>
          <textarea
            id="repoContext"
            value={repoContext}
            onChange={(event) => setRepoContext(event.target.value)}
            placeholder="Important folders, docs, state contracts, APIs, UI constraints, and things agents must preserve."
            rows={3}
            className={`${inputBase} resize-none leading-relaxed`}
          />
        </div>

        <div>
          <label htmlFor="sourceHints" className={fieldLabel}>
            Source hints
          </label>
          <textarea
            id="sourceHints"
            value={sourceHints}
            onChange={(event) => setSourceHints(event.target.value)}
            placeholder={"convex/auctions.ts\ncomponents/task/TaskView.tsx\nlib/specialists/registry.ts"}
            rows={3}
            className={`${inputBase} resize-none font-mono text-xs leading-relaxed`}
          />
        </div>

        {latest?.hyperspell_error && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {latest.hyperspell_error}
          </p>
        )}

        <Button
          type="submit"
          disabled={saving || !companyName.trim() || !businessContext.trim()}
          className="w-full"
        >
          {saving ? (
            <>
              <CircleNotch size={16} className="animate-spin" weight="bold" />
              Saving context…
            </>
          ) : (
            "Save product context"
          )}
        </Button>

        {message && <p className="text-xs text-ink-muted">{message}</p>}
      </form>
    </Card>
  );
}
