import { Card, CardHeader } from "@/components/ui/Card";
import type { TaskDoc, LifecycleEventDoc } from "@/lib/task-view";
import { MarkdownLite } from "./MarkdownLite";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { LaunchProduct } from "./LaunchProduct";
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
          meta={<span className="text-rose-700">Failed</span>}
        />
        <p className="text-sm text-ink-muted">
          <span className="font-mono text-ink">{agentId}</span> failed: {reason}.
          Escrow refunded.
        </p>
      </Card>
    );
  }

  if (!completed) {
    return (
      <Card className="animate-fade-up">
        <CardHeader
          title="Execution"
          meta={<span className="text-brand-700">Running</span>}
        />
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <CircleNotch
            size={14}
            weight="bold"
            className="animate-spin text-brand-600"
          />
          <span>
            <span className="font-mono text-ink">{agentId}</span> is working
            <span className="streaming-caret" />
          </span>
        </div>
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
      ) : text ? (
        <MarkdownLite text={text} />
      ) : (
        <p className="text-sm text-ink-muted">No output captured</p>
      )}
    </Card>
  );
}
