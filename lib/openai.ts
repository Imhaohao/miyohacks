const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_AZURE_API_VERSION = "2024-10-21";

export type ModelPurpose =
  | "default"
  | "agent"
  | "judge"
  | "suggester"
  | "intake"
  | "planner"
  | "discovery"
  | "demo";

type ModelProvider = "openai" | "azure-openai" | "foundry" | "disabled";
type AzureApiMode = "responses" | "chat";

interface CallOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
  purpose?: ModelPurpose;
}

interface OpenAITextResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

interface ResponsesTextResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envFlag(name: string): boolean {
  const value = (env(name) ?? "").toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

function purposeSuffix(purpose: ModelPurpose | undefined): string {
  return (purpose ?? "default").toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function provider(): ModelProvider {
  if (
    envFlag("ARBOR_MODEL_SPEND_DISABLED") ||
    envFlag("ARBOR_MODEL_CALLS_DISABLED")
  ) {
    return "disabled";
  }

  const raw = (env("ARBOR_MODEL_PROVIDER") ?? "").toLowerCase();
  if (["off", "disable", "disabled", "none"].includes(raw)) return "disabled";
  if (["azure", "azure-openai", "aoai"].includes(raw)) return "azure-openai";
  if (["foundry", "azure-foundry", "azure-ai-foundry"].includes(raw)) {
    return "foundry";
  }
  if (["openai", "direct"].includes(raw)) {
    return envFlag("ARBOR_REQUIRE_AZURE") ? "disabled" : "openai";
  }

  const azureEnabled = (env("ARBOR_AZURE_ENABLED") ?? "").toLowerCase();
  if (["0", "false", "off", "disabled"].includes(azureEnabled)) {
    return "openai";
  }
  if (["1", "true", "on", "enabled"].includes(azureEnabled)) {
    return "azure-openai";
  }

  if (envFlag("ARBOR_REQUIRE_AZURE")) {
    return "disabled";
  }

  return "openai";
}

function openAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

function azureApiKey(): string {
  const key = env("AZURE_OPENAI_API_KEY");
  if (!key) throw new Error("AZURE_OPENAI_API_KEY is not set");
  return key;
}

function foundryApiKey(): string {
  const key = env("AZURE_FOUNDRY_API_KEY") ?? env("AZURE_INFERENCE_CREDENTIAL");
  if (!key) {
    throw new Error(
      "AZURE_FOUNDRY_API_KEY or AZURE_INFERENCE_CREDENTIAL is not set",
    );
  }
  return key;
}

function normalizeEndpoint(endpoint: string, stripOpenAIV1 = false): string {
  let trimmed = endpoint.trim().replace(/\/+$/, "");
  if (stripOpenAIV1) {
    trimmed = trimmed.replace(/\/openai\/v1$/i, "");
  }
  return trimmed;
}

function appendPath(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function openAIModel(purpose?: ModelPurpose): string {
  const suffix = purposeSuffix(purpose);
  return (
    env(`OPENAI_${suffix}_MODEL`) ??
    env(`ARBOR_${suffix}_MODEL`) ??
    env("OPENAI_MODEL") ??
    env("ARBOR_MODEL") ??
    DEFAULT_OPENAI_MODEL
  );
}

function azureDeployment(purpose?: ModelPurpose): string {
  const suffix = purposeSuffix(purpose);
  const deployment =
    env(`AZURE_OPENAI_${suffix}_DEPLOYMENT`) ??
    env(`ARBOR_${suffix}_MODEL`) ??
    env("AZURE_OPENAI_DEPLOYMENT") ??
    env("ARBOR_MODEL");
  if (!deployment) {
    throw new Error(
      `Azure OpenAI deployment is not set for purpose "${purpose ?? "default"}". Set AZURE_OPENAI_${suffix}_DEPLOYMENT or AZURE_OPENAI_DEPLOYMENT.`,
    );
  }
  return deployment;
}

function foundryDeployment(purpose?: ModelPurpose): string {
  const suffix = purposeSuffix(purpose);
  const deployment =
    env(`AZURE_FOUNDRY_${suffix}_DEPLOYMENT`) ??
    env(`AZURE_AI_FOUNDRY_${suffix}_DEPLOYMENT`) ??
    env(`ARBOR_${suffix}_MODEL`) ??
    env("AZURE_FOUNDRY_DEPLOYMENT") ??
    env("AZURE_AI_FOUNDRY_DEPLOYMENT") ??
    env("AZURE_FOUNDRY_MODEL") ??
    env("ARBOR_MODEL");
  if (!deployment) {
    throw new Error(
      `Azure Foundry deployment is not set for purpose "${purpose ?? "default"}". Set AZURE_FOUNDRY_${suffix}_DEPLOYMENT or AZURE_FOUNDRY_DEPLOYMENT.`,
    );
  }
  return deployment;
}

function azureEndpoint(): string {
  const endpoint = env("AZURE_OPENAI_ENDPOINT");
  if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT is not set");
  return normalizeEndpoint(endpoint);
}

function foundryEndpoint(): string {
  const endpoint = env("AZURE_FOUNDRY_ENDPOINT") ?? env("AZURE_AI_FOUNDRY_ENDPOINT");
  if (!endpoint) {
    throw new Error(
      "AZURE_FOUNDRY_ENDPOINT or AZURE_AI_FOUNDRY_ENDPOINT is not set",
    );
  }
  return normalizeEndpoint(endpoint, true);
}

function azureApiMode(): AzureApiMode {
  const raw = (env("AZURE_OPENAI_API_MODE") ?? "responses").toLowerCase();
  return raw === "chat" ? "chat" : "responses";
}

function maxOutputTokens(purpose: ModelPurpose | undefined, requested: number): number {
  const suffix = purposeSuffix(purpose);
  const raw =
    env(`ARBOR_${suffix}_MAX_OUTPUT_TOKENS`) ?? env("ARBOR_MAX_OUTPUT_TOKENS");
  if (!raw) return requested;
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) return requested;
  return Math.max(1, Math.min(requested, Math.floor(cap)));
}

function extractText(data: OpenAITextResponse): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  throw new Error("OpenAI returned no text content");
}

function extractResponsesText(data: ResponsesTextResponse): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  const text = data.output
    ?.flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  if (text && text.trim()) return text;
  throw new Error("Responses API returned no output text");
}

function openAIChatUrl(): string {
  const base = env("OPENAI_BASE_URL");
  if (!base) return OPENAI_CHAT_COMPLETIONS_URL;
  const normalized = normalizeEndpoint(base);
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return appendPath(normalized, "chat/completions");
}

function openAIHeaders(): Record<string, string> {
  const key = openAIApiKey();
  const header = (env("OPENAI_API_KEY_HEADER") ?? "authorization").toLowerCase();
  if (header === "api-key") return { "api-key": key };
  return { authorization: `Bearer ${key}` };
}

async function postJSON(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    timeoutMs,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model API error ${response.status}: ${text.slice(0, 300)}`);
  }

  return await response.json();
}

async function callOpenAIChat(opts: RequiredCallOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: openAIModel(opts.purpose),
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    max_completion_tokens: opts.maxTokens,
  };
  const effort =
    env("OPENAI_REASONING_EFFORT") ?? env("ARBOR_REASONING_EFFORT") ?? "none";
  if (effort && effort.toLowerCase() !== "default") body.reasoning_effort = effort;

  return extractText(
    (await postJSON(
      openAIChatUrl(),
      openAIHeaders(),
      body,
      opts.timeoutMs,
    )) as OpenAITextResponse,
  );
}

async function callAzureResponses(opts: RequiredCallOptions): Promise<string> {
  const endpoint = normalizeEndpoint(azureEndpoint(), true);
  return extractResponsesText(
    (await postJSON(
      appendPath(endpoint, "/openai/v1/responses"),
      { "api-key": azureApiKey() },
      {
        model: azureDeployment(opts.purpose),
        instructions: opts.systemPrompt,
        input: opts.userPrompt,
        max_output_tokens: opts.maxTokens,
      },
      opts.timeoutMs,
    )) as ResponsesTextResponse,
  );
}

async function callAzureChat(opts: RequiredCallOptions): Promise<string> {
  const endpoint = normalizeEndpoint(azureEndpoint(), true);
  const deployment = encodeURIComponent(azureDeployment(opts.purpose));
  const apiVersion = env("AZURE_OPENAI_API_VERSION") ?? DEFAULT_AZURE_API_VERSION;
  return extractText(
    (await postJSON(
      `${appendPath(
        endpoint,
        `/openai/deployments/${deployment}/chat/completions`,
      )}?api-version=${encodeURIComponent(apiVersion)}`,
      { "api-key": azureApiKey() },
      {
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
        max_completion_tokens: opts.maxTokens,
      },
      opts.timeoutMs,
    )) as OpenAITextResponse,
  );
}

async function callFoundryChat(opts: RequiredCallOptions): Promise<string> {
  const endpoint = foundryEndpoint();
  const deployment = encodeURIComponent(foundryDeployment(opts.purpose));
  const apiVersion = env("AZURE_FOUNDRY_API_VERSION") ?? DEFAULT_AZURE_API_VERSION;
  return extractText(
    (await postJSON(
      `${appendPath(
        endpoint,
        `/openai/deployments/${deployment}/chat/completions`,
      )}?api-version=${encodeURIComponent(apiVersion)}`,
      { "api-key": foundryApiKey() },
      {
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
        max_completion_tokens: opts.maxTokens,
      },
      opts.timeoutMs,
    )) as OpenAITextResponse,
  );
}

interface RequiredCallOptions extends Required<Omit<CallOptions, "purpose">> {
  purpose?: ModelPurpose;
}

export function describeModelRuntime(purpose?: ModelPurpose): {
  provider: ModelProvider;
  purpose: ModelPurpose;
  model: string;
  apiMode?: AzureApiMode;
  endpoint?: string;
} {
  const selected = provider();
  const resolvedPurpose = purpose ?? "default";
  if (selected === "disabled") {
    return { provider: selected, purpose: resolvedPurpose, model: "(disabled)" };
  }
  if (selected === "azure-openai") {
    return {
      provider: selected,
      purpose: resolvedPurpose,
      model: azureDeployment(purpose),
      apiMode: azureApiMode(),
      endpoint: azureEndpoint(),
    };
  }
  if (selected === "foundry") {
    return {
      provider: selected,
      purpose: resolvedPurpose,
      model: foundryDeployment(purpose),
      apiMode: "chat",
      endpoint: foundryEndpoint(),
    };
  }
  return {
    provider: selected,
    purpose: resolvedPurpose,
    model: openAIModel(purpose),
    endpoint: openAIChatUrl(),
  };
}

export async function callOpenAI(opts: CallOptions): Promise<string> {
  const {
    systemPrompt,
    userPrompt,
    maxTokens = 1024,
    timeoutMs = 20_000,
    retries = 1,
    purpose,
  } = opts;

  const resolved: RequiredCallOptions = {
    systemPrompt,
    userPrompt,
    maxTokens: maxOutputTokens(purpose, maxTokens),
    timeoutMs,
    retries,
    purpose,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const selected = provider();
      if (selected === "disabled") {
        throw new Error(
          envFlag("ARBOR_REQUIRE_AZURE") && !env("ARBOR_MODEL_PROVIDER")
            ? "ARBOR_REQUIRE_AZURE=true but ARBOR_MODEL_PROVIDER is not azure-openai or foundry — refusing direct OpenAI fallback"
            : "remote model calls are switched off by ARBOR_MODEL_PROVIDER=disabled or ARBOR_MODEL_SPEND_DISABLED=true",
        );
      }
      if (selected === "azure-openai") {
        return azureApiMode() === "chat"
          ? await callAzureChat(resolved)
          : await callAzureResponses(resolved);
      }
      if (selected === "foundry") return await callFoundryChat(resolved);
      return await callOpenAIChat(resolved);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("OpenAI call failed");
}

/**
 * Call OpenAI and parse the response as JSON. Tries to extract a JSON object
 * from the response even if the model wraps it in prose or fences.
 */
export async function callOpenAIJSON<T>(opts: CallOptions): Promise<T> {
  const text = await callOpenAI(opts);
  return parseJSONLoose<T>(text);
}

export function parseJSONLoose<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through to extraction
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    return JSON.parse(fence[1]) as T;
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1)) as T;
  }
  throw new Error(`Could not parse JSON from OpenAI response: ${trimmed.slice(0, 200)}`);
}
