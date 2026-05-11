export interface A2AAgentCard {
  name?: string;
  description?: string;
  url?: string;
  version?: string;
  capabilities?: Record<string, unknown>;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: Array<{
    id?: string;
    name?: string;
    description?: string;
    tags?: string[];
  }>;
}

export interface A2AArtifact {
  name?: string;
  description?: string;
  parts?: Array<{ kind?: string; text?: string; data?: unknown }>;
}

export interface A2ATaskResponse {
  id?: string;
  status?: { state?: string; message?: { parts?: Array<{ text?: string }> } };
  artifacts?: A2AArtifact[];
}

async function fetchJson<T>(
  url: string,
  body?: Record<string, unknown>,
  apiKey?: string,
  timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`A2A HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAgentCard(
  agentCardUrl: string,
  apiKey?: string,
): Promise<A2AAgentCard> {
  return await fetchJson<A2AAgentCard>(agentCardUrl, undefined, apiKey, 12_000);
}

export async function sendA2ATask(args: {
  endpointUrl: string;
  prompt: string;
  apiKey?: string;
}): Promise<A2ATaskResponse> {
  return await fetchJson<A2ATaskResponse>(
    args.endpointUrl,
    {
      jsonrpc: "2.0",
      id: `arbor-${Date.now()}`,
      method: "tasks/send",
      params: {
        message: {
          role: "user",
          parts: [{ kind: "text", text: args.prompt }],
        },
      },
    },
    args.apiKey,
    45_000,
  );
}

export function normalizeA2AResult(response: A2ATaskResponse): string {
  const artifactText = response.artifacts
    ?.flatMap((artifact) => artifact.parts ?? [])
    .map((part) => {
      if (typeof part.text === "string") return part.text;
      if (part.data !== undefined) return JSON.stringify(part.data, null, 2);
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
  if (artifactText) return artifactText;

  const statusText = response.status?.message?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => Boolean(text))
    .join("\n");
  if (statusText) return statusText;

  return JSON.stringify(response, null, 2);
}

