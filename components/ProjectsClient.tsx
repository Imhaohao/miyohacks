"use client";

import Link from "next/link";
import { useState } from "react";
import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function ProjectsClient() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const projects = useQuery(
    api.projects.listMine,
    isAuthenticated ? {} : "skip",
  );
  const create = useMutation(api.projects.create);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isAuthenticated) {
      setError("Sign in before creating a private project.");
      return;
    }
    if (!name.trim()) return;
    setBusy(true);
    try {
      await create({ name });
      setName("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes("authentication required")
          ? "Sign in before creating a private project."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Create project" meta="Private context boundary" />
        {!isAuthenticated && !isLoading ? (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-800">
            {clerkEnabled
              ? "Sign in to create a private project and attach repo/product context."
              : "Clerk auth is not configured, so private project creation is disabled."}
          </div>
        ) : null}
        <form onSubmit={onCreate} className="flex flex-wrap gap-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            disabled={!isAuthenticated || busy}
            className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-600 focus:outline-none focus:shadow-ring"
          />
          {isAuthenticated ? (
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating..." : "Create"}
            </Button>
          ) : clerkEnabled ? (
            <SignInButton mode="modal">
              <Button type="button">Sign in</Button>
            </SignInButton>
          ) : (
            <Button type="button" disabled>
              Sign in unavailable
            </Button>
          )}
        </form>
        {error ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {((projects ?? []) as Doc<"projects">[]).map((project) => (
          <Link key={project._id} href={`/projects/${project._id}`}>
            <Card className="h-full">
              <CardHeader title={project.name} meta="Open" />
              <div className="space-y-1 text-sm text-ink-muted">
                <div>{project.product_url ?? "No product URL yet"}</div>
                <div>{project.github_repo_url ?? "No GitHub repo yet"}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
