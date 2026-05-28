"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type {
  AgentToolCallDoc,
  TaskDoc,
  LifecycleEventDoc,
} from "@/lib/task-view";
import { MarkdownLite } from "./MarkdownLite";
import { LaunchProduct } from "./LaunchProduct";
import type { ExecutionArtifact, SpecialistProvenance } from "@/lib/types";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
  toolCalls: AgentToolCallDoc[];
}

interface ResultShape {
  text: string;
  agent_id: string;
  artifact?: ExecutionArtifact;
  provenance?: SpecialistProvenance;
}

function TierBadge({ provenance }: { provenance?: SpecialistProvenance }) {
  if (!provenance) return null;
  const { tier, live_tools_called } = provenance;
  const count = provenance.successful_tool_call_count ?? 0;
  if (tier === "a2a-bridge") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
        A2A BRIDGE
      </span>
    );
  }
  if (provenance.transport === "mcp" && count > 0) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
        LIVE MCP
      </span>
    );
  }
  if (tier === "real" && live_tools_called) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
        LIVE API
      </span>
    );
  }
  if (tier === "mcp-forwarding" && !live_tools_called) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
        MCP FALLBACK
      </span>
    );
  }
  if (tier === "a2a") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
        A2A LIVE
      </span>
    );
  }
  // mock or unknown
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      MOCK
    </span>
  );
}

function ProofSummary({
  provenance,
  toolCalls,
}: {
  provenance?: SpecialistProvenance;
  toolCalls: AgentToolCallDoc[];
}) {
  if (!provenance && toolCalls.length === 0) return null;
  const successful = toolCalls.filter((call) => call.status === "succeeded");
  const failed = toolCalls.filter((call) => call.status === "failed");
  const latest = [...toolCalls].slice(-6);
  const sessionId =
    provenance?.external_session_id ??
    [...toolCalls].reverse().find((call) => call.external_session_id)
      ?.external_session_id;
  const prUrl =
    provenance?.pr_url ?? [...toolCalls].reverse().find((call) => call.pr_url)?.pr_url;

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span>Proof: {provenance?.proof_level ?? "none"}</span>
        <span>{successful.length} successful calls</span>
        {failed.length > 0 ? <span>{failed.length} failed calls</span> : null}
        {sessionId ? (
          <span>
            Session <span className="font-mono text-ink">{sessionId}</span>
          </span>
        ) : null}
        {prUrl ? (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-700 hover:underline"
          >
            PR opened
          </a>
        ) : provenance?.external_session_id ? (
          <span>PR missing</span>
        ) : null}
      </div>
      {latest.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {latest.map((call) => (
            <div
              key={call._id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
            >
              <span
                className={
                  call.status === "succeeded"
                    ? "font-semibold text-green-700"
                    : call.status === "failed"
                      ? "font-semibold text-rose-700"
                      : "font-semibold text-ink-muted"
                }
              >
                {call.status}
              </span>
              <span className="font-mono text-ink">
                {call.tool_name ?? call.method}
              </span>
              <span className="text-ink-muted">{call.endpoint_host}</span>
              {call.duration_ms !== undefined ? (
                <span className="text-ink-muted">{call.duration_ms}ms</span>
              ) : null}
              {call.error_message ? (
                <span className="min-w-0 flex-1 truncate text-rose-700">
                  {call.error_message}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isResult(v: unknown): v is ResultShape {
  return (
    !!v &&
      typeof v === "object" &&
      "text" in v &&
      typeof (v as Record<string, unknown>).text === "string"
  );
}

export function ExecutionPanel({ task, events, toolCalls }: Props) {
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
      agentId === "reacher-social" ||
      agentId === "nia-context" ||
      agentId === "devin-engineer";
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="Execution"
          meta={<Pill tone="brand" pulse>Running</Pill>}
        />
        <LoadingProgress
          label={`${agentId} is working`}
          status={
            agentId === "devin-engineer"
              ? "Creating a Devin bridge session and waiting for verifiable session or PR evidence."
              : isMcpForwarder
              ? "Forwarding to the live MCP server. Each tool call adds a few seconds."
              : "Generating the work product against the enriched context."
          }
          details={
            agentId === "devin-engineer"
              ? [
                  "Requires devin_session_create to return a session id.",
                  "PR proof appears only after Arbor captures a verified PR URL.",
                ]
              : isMcpForwarder
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
  const provenance = isResult(task.result) ? task.result.provenance : undefined;

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Execution complete"
        meta={
          <span className="flex items-center gap-2">
            <TierBadge provenance={provenance} />
            By <span className="font-mono text-ink">{agentId}</span>
          </span>
        }
      />
      {artifact?.kind === "campaign_launch" ? (
        <LaunchProduct artifact={artifact} />
      ) : text ? (
        <MarkdownLite text={text} />
      ) : (
        <p className="text-sm text-ink-muted">No output captured</p>
      )}
      <ProofSummary provenance={provenance} toolCalls={toolCalls} />
    </Card>
  );
}
