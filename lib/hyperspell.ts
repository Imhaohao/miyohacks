import fs from "node:fs";
import path from "node:path";
import type { BusinessContext } from "./orchestration-context";

type MemorySource =
  | "vault"
  | "web_crawler"
  | "notion"
  | "slack"
  | "google_calendar"
  | "google_mail"
  | "box"
  | "dropbox"
  | "github"
  | "google_drive"
  | "reddit"
  | "trace"
  | "microsoft_teams"
  | "gmail_actions";

export interface AddMemoryParams {
  userId: string;
  text: string;
  title?: string;
  collection?: string;
  resourceId?: string;
  date?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface UploadFileParams {
  userId: string;
  filePath: string;
  collection?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ListMemoriesParams {
  userId: string;
  collection?: string;
  source?: MemorySource;
  size?: number;
}

export interface SearchMemoriesParams {
  userId: string;
  query: string;
  answer?: boolean;
  maxResults?: number;
  sources?: MemorySource[];
}

interface MemoryStatus {
  source: MemorySource;
  resource_id: string;
  status: string;
}

interface MemoryResource {
  source: MemorySource;
  resource_id: string;
  title?: string | null;
  metadata?: Record<string, unknown>;
  score?: number | null;
}

interface MemoryQueryResult {
  query_id?: string | null;
  documents: MemoryResource[];
  answer?: string | null;
  errors?: Array<Record<string, string>> | null;
}

export interface HyperspellBusinessEnrichment {
  business: BusinessContext;
  answer: string;
  document_count: number;
  duration_ms: number;
  user_id_used: string;
}

export type HyperspellEnrichmentResult =
  | { ok: true; enrichment: HyperspellBusinessEnrichment }
  | { ok: false; reason: string; user_id_used: string | null; duration_ms: number };

const HYPERSPELL_BASE_URL = "https://api.hyperspell.com";

function hyperspellHeaders(userId: string): Record<string, string> {
  const apiKey = process.env.HYPERSPELL_API_KEY;
  if (!apiKey) throw new Error("HYPERSPELL_API_KEY is not set");
  return {
    authorization: `Bearer ${apiKey}`,
    "X-As-User": userId,
  };
}

async function hyperspellJson<T>(
  userId: string,
  pathName: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(`${HYPERSPELL_BASE_URL}${pathName}`, {
    ...init,
    headers: {
      ...hyperspellHeaders(userId),
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Hyperspell ${pathName} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function addMemory({
  userId,
  text,
  title,
  collection,
  resourceId,
  date,
  metadata,
}: AddMemoryParams) {
  return await hyperspellJson<MemoryStatus>(userId, "/memories/add", {
    method: "POST",
    body: JSON.stringify({
      text,
      title,
      collection,
      resource_id: resourceId,
      date,
      metadata,
    }),
  });
}

export async function uploadFile({
  userId,
  filePath,
  collection,
  metadata,
}: UploadFileParams) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([fs.readFileSync(filePath)]),
    path.basename(filePath),
  );
  if (collection) form.append("collection", collection);
  if (metadata) form.append("metadata", JSON.stringify(metadata));

  return await hyperspellJson<MemoryStatus>(userId, "/memories/upload", {
    method: "POST",
    body: form,
  });
}

export async function listMemories({
  userId,
  collection,
  source,
  size,
}: ListMemoriesParams) {
  const memories: MemoryResource[] = [];
  let cursor: string | null | undefined;
  do {
    const url = new URL(`${HYPERSPELL_BASE_URL}/memories/list`);
    if (collection) url.searchParams.set("collection", collection);
    if (source) url.searchParams.set("source", source);
    if (size) url.searchParams.set("size", String(Math.min(size, 100)));
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await hyperspellJson<{
      items: MemoryResource[];
      next_cursor: string | null;
    }>(userId, `${url.pathname}${url.search}`, { method: "GET" });
    memories.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor && (!size || memories.length < size));

  if (size && memories.length > size) {
    return memories.slice(0, size);
  }
  return memories;
}

export async function searchMemories({
  userId,
  query,
  answer = true,
  maxResults = 5,
  sources,
}: SearchMemoriesParams) {
  return await hyperspellJson<MemoryQueryResult>(userId, "/memories/query", {
    method: "POST",
    body: JSON.stringify({
      query,
      answer,
      options: { max_results: maxResults },
      sources,
    }),
  });
}

function splitSentences(text: string, limit: number): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Resolves which Hyperspell user identity to send via X-As-User.
 *
 * The web form hardcodes `posted_by: "buyer:web"`, which has no connected
 * sources in Hyperspell. Setting HYPERSPELL_USER_ID overrides per-task ids
 * and lets the demo query the identity that actually owns the Drive/Notion/
 * etc. integrations.
 */
function resolveHyperspellUserId(taskUserId: string): string {
  const override = process.env.HYPERSPELL_USER_ID?.trim();
  return override && override.length > 0 ? override : taskUserId;
}

export async function enrichBusinessContextFromHyperspell(args: {
  userId: string;
  prompt: string;
  taskType: string;
  fallback: BusinessContext;
}): Promise<HyperspellEnrichmentResult> {
  const started = Date.now();
  if (!process.env.HYPERSPELL_API_KEY) {
    return { ok: false, reason: "HYPERSPELL_API_KEY is not set", user_id_used: null, duration_ms: 0 };
  }

  const userId = resolveHyperspellUserId(args.userId);
  const query = [
    "What business context, customer knowledge, constraints, prior decisions,",
    "workspace facts, or user preferences are relevant to this agent task?",
    "",
    `Task type: ${args.taskType}`,
    `Task: ${args.prompt}`,
  ].join("\n");

  let result: MemoryQueryResult;
  try {
    result = await searchMemories({
      userId,
      query,
      answer: true,
      maxResults: 5,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message, user_id_used: userId, duration_ms: Date.now() - started };
  }

  await addMemory({
    userId,
    title: `Arbor task brief: ${args.taskType}`,
    collection: "arbor_task_briefs",
    text: [
      `Task type: ${args.taskType}`,
      `Posted at: ${new Date().toISOString()}`,
      "",
      args.prompt,
    ].join("\n"),
    date: new Date().toISOString(),
    metadata: {
      task_type: args.taskType,
      source: "arbor",
    },
  }).catch(() => undefined);

  const answer = result.answer?.trim() ?? "";
  if (!answer && result.documents.length === 0) {
    const errorDetail = result.errors?.length
      ? result.errors.map((e) => `${e.error}: ${e.message}`).join("; ")
      : `no documents matched for X-As-User=${userId}`;
    return {
      ok: false,
      reason: `Hyperspell returned no answer (${errorDetail})`,
      user_id_used: userId,
      duration_ms: Date.now() - started,
    };
  }

  const facts = splitSentences(answer, 4);
  const business: BusinessContext = {
    ...args.fallback,
    summary: answer || args.fallback.summary,
    known_facts: [...args.fallback.known_facts, ...facts].slice(0, 8),
    constraints: [
      ...args.fallback.constraints,
      "Hyperspell memory search should be treated as business/workspace context, not repo truth.",
    ],
    open_questions: [
      ...args.fallback.open_questions,
      "Which retrieved workspace memories should be confirmed by the user before execution?",
    ],
  };

  return {
    ok: true,
    enrichment: {
      business,
      answer,
      document_count: result.documents.length,
      duration_ms: Date.now() - started,
      user_id_used: userId,
    },
  };
}
