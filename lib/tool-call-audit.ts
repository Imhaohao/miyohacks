import type {
  ProofLevel,
  SpecialistProvenance,
  ToolCallAuditOutcome,
} from "./types";

const SECRET_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|authorization|bearer|cookie|session|credential)/i;

export function endpointHost(endpoint?: string): string | undefined {
  if (!endpoint) return undefined;
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint.slice(0, 120);
  }
}

export function redactToolArguments(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[redacted:depth]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    return value.length > 600 ? `${value.slice(0, 600)}...` : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => redactToolArguments(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redactToolArguments(nested, depth + 1);
    }
  }
  return out;
}

export function previewValue(value: unknown, max = 700): string {
  const text =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function walkForStringKey(value: unknown, keys: Set<string>): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkForStringKey(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (keys.has(key) && typeof nested === "string" && nested.trim()) {
      return nested.trim();
    }
  }
  for (const nested of Object.values(record)) {
    const found = walkForStringKey(nested, keys);
    if (found) return found;
  }
  return undefined;
}

export function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
}

export function extractDevinSessionId(value: unknown): string | undefined {
  const parsed =
    typeof value === "string" ? parseMaybeJson(value) : value;
  return walkForStringKey(
    parsed,
    new Set([
      "session_id",
      "sessionId",
      "session_uuid",
      "devin_session_id",
      "id",
    ]),
  );
}

export function extractPrMetadata(value: unknown): {
  pr_url?: string;
  pr_number?: number;
} {
  const parsed = typeof value === "string" ? parseMaybeJson(value) : value;
  const prUrl =
    walkForStringKey(parsed, new Set(["pr_url", "pull_request_url", "html_url"])) ??
    (typeof parsed === "string"
      ? parsed.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/)?.[0]
      : undefined);
  const prNumber = prUrl
    ? Number(prUrl.match(/\/pull\/(\d+)/)?.[1] ?? NaN)
    : undefined;
  return {
    pr_url: prUrl,
    pr_number: Number.isFinite(prNumber) ? prNumber : undefined,
  };
}

export function mcpToolOutcome(args: {
  result: { isError?: boolean };
  preview: string;
  external_session_id?: string;
  external_task_id?: string;
  pr_url?: string;
  pr_number?: number;
}): ToolCallAuditOutcome {
  const ok = args.result.isError !== true;
  return {
    ok,
    result_preview: args.preview,
    error_message: ok ? undefined : args.preview.slice(0, 500),
    external_session_id: args.external_session_id,
    external_task_id: args.external_task_id,
    pr_url: args.pr_url,
    pr_number: args.pr_number,
  };
}

export function finalizeProvenance(
  provenance: SpecialistProvenance,
  successfulToolCallIds: string[],
): SpecialistProvenance {
  const isAuditedToolTransport =
    provenance.tier === "mcp-forwarding" ||
    provenance.tier === "a2a-bridge" ||
    provenance.transport === "mcp" ||
    provenance.transport === "a2a-bridge";
  const successful_tool_call_count =
    provenance.successful_tool_call_count ?? successfulToolCallIds.length;
  const proofLevel: ProofLevel =
    provenance.pr_url || provenance.pr_number
      ? "pr_opened"
      : provenance.external_session_id
        ? "agent_session"
        : successful_tool_call_count > 0
          ? "tool_call"
          : provenance.proof_level ?? "none";

  return {
    ...provenance,
    live_tools_called: isAuditedToolTransport
      ? successful_tool_call_count > 0
      : provenance.live_tools_called,
    successful_tool_call_count,
    tool_call_ids:
      provenance.tool_call_ids && provenance.tool_call_ids.length > 0
        ? provenance.tool_call_ids
        : successfulToolCallIds,
    proof_level: proofLevel,
  };
}
