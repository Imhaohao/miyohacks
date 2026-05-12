"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ProductContextForm } from "@/components/ProductContextForm";
import { Card, CardHeader } from "@/components/ui/Card";

export function ProjectDetailClient({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const { isAuthenticated } = useConvexAuth();
  const project = useQuery(
    api.projects.getMine,
    isAuthenticated ? { project_id: projectId } : "skip",
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <Card className="h-fit">
        <CardHeader title={project?.name ?? "Project"} meta="Private" />
        <div className="space-y-2 text-sm text-ink-muted">
          <div>{project?.product_url ?? "No product URL yet"}</div>
          <div>{project?.github_repo_url ?? "No GitHub repo yet"}</div>
        </div>
      </Card>
      <ProductContextForm projectId={projectId} />
    </div>
  );
}
