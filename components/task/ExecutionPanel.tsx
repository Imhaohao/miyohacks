"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type { TaskDoc, LifecycleEventDoc } from "@/lib/task-view";
import { MarkdownLite } from "./MarkdownLite";
import { LaunchProduct } from "./LaunchProduct";
import { ImplementationPlanProduct } from "./ImplementationPlanProduct";
import type { ExecutionArtifact } from "@/lib/types";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

interface ResultShape {
  text: string;
  agent_id: string;
  artifact?: ExecutionArtifact;
}

function isResult(v: unknown): v is ResultShape {
  return (
    !!v &&
      typeof v === "object" &&
      "text" in v &&
      typeof (v as Record<string, unknown>).text === "string"
  );
}

export function ExecutionPanel({ task, events }: Props) {
  const started = events.find((e) => e.event_type === "execution_started");
  const completed = events.find((e) => e.event_type === "execution_complete");
  const failed = events.find((e) => e.event_type === "execution_failed");
  const elapsed = useElapsedSeconds(
    started && !completed && !failed ? started.timestamp : undefined,
  );

  if (!started) return null;

  const agentId =
    (started.payload as { agent_id?: string }).agent_id ?? "winner";

  if (failed) {
    const reason =
      (failed.payload as { reason?: string }).reason ?? "unknown error";
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="Execution"
          meta={<Pill tone="danger">Failed</Pill>}
        />
        <p className="text-sm text-ink-muted">
          <span className="font-mono text-ink">{agentId}</span> failed: {reason}.
          Escrow refunded.
        </p>
      </Card>
    );
  }

  if (!completed) {
    // Real-MCP specialists (Reacher, Nia) take longer than soft ones because
    // they make external HTTP calls. Surface that expectation in the status.
    const isMcpForwarder =
      agentId === "reacher-social" || agentId === "nia-context";
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="Execution"
          meta={<Pill tone="brand" pulse>Running</Pill>}
        />
        <LoadingProgress
          label={`${agentId} is working`}
          status={
            isMcpForwarder
              ? "Forwarding to the live MCP server. Each tool call adds a few seconds."
              : "Generating the work product against the enriched context."
          }
          details={
            isMcpForwarder
              ? [
                  "Calling remote MCP tools and synthesizing the result.",
                  "Will surface the final answer when the agent stops calling tools.",
                ]
              : [
                  "Reads the Hyperspell + Nia context packet from the prompt.",
                  "Output streams in once execution_complete fires.",
                ]
          }
          elapsedSeconds={elapsed}
          tone="brand"
        />
        <div className="mt-4 space-y-2">
          <div className="shimmer h-3 w-full rounded" />
          <div className="shimmer h-3 w-5/6 rounded" />
          <div className="shimmer h-3 w-2/3 rounded" />
        </div>
      </Card>
    );
  }

  const text = isResult(task.result)
    ? task.result.text
    : task.result
      ? JSON.stringify(task.result, null, 2)
      : "";
  const artifact = isResult(task.result) ? task.result.artifact : undefined;

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Execution complete"
        meta={
          <span>
            By <span className="font-mono text-ink">{agentId}</span>
          </span>
        }
      />
      {artifact?.kind === "campaign_launch" ? (
        <LaunchProduct artifact={artifact} />
      ) : artifact?.kind === "implementation_plan" ? (
        <ImplementationPlanProduct artifact={artifact} />
      ) : text ? (
        <MarkdownLite text={text} />
      ) : (
        <p className="text-sm text-ink-muted">No output captured</p>
      )}
    </Card>
  );
}
