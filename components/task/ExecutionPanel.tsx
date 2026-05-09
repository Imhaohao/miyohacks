import { Card, CardHeader } from "@/components/ui/Card";
import type { TaskDoc, LifecycleEventDoc } from "@/lib/task-view";
import { MarkdownLite } from "./MarkdownLite";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

interface ResultShape {
  text: string;
  agent_id: string;
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
      <Card>
        <CardHeader>
          <span>Execution</span>
          <span className="text-terminal-danger">failed</span>
        </CardHeader>
        <p className="text-sm text-terminal-muted">
          <span className="font-mono text-terminal-text">{agentId}</span> failed:
          {" "}
          {reason}. Escrow refunded.
        </p>
      </Card>
    );
  }

  if (!completed) {
    return (
      <Card>
        <CardHeader>
          <span>Execution</span>
          <span className="animate-pulse text-blue-400">running</span>
        </CardHeader>
        <div className="flex items-center gap-3 text-sm text-terminal-muted">
          <Spinner />
          <span>
            <span className="font-mono text-terminal-text">{agentId}</span> is
            working…
          </span>
        </div>
      </Card>
    );
  }

  const text = isResult(task.result)
    ? task.result.text
    : task.result
      ? JSON.stringify(task.result, null, 2)
      : "";

  return (
    <Card>
      <CardHeader>
        <span>Execution complete</span>
        <span>by · {agentId}</span>
      </CardHeader>
      {text ? (
        <MarkdownLite text={text} />
      ) : (
        <p className="text-xs text-terminal-muted">no output captured</p>
      )}
    </Card>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
  );
}
