"use node";

import type { GitHubAuth, RepoRef } from "./github";
import { getFile } from "./github";
import { callRemoteTool, flattenToolResult } from "./mcp-outbound";

export interface CodexContextExcerpt {
  path: string;
  content: string;
}

const MAX_EXCERPT_CHARS = 8_000;
const MAX_EXCERPTS = 8;
const NIA_MCP_URL = "https://apigcp.trynia.ai/mcp";

function truncate(value: string, max = MAX_EXCERPT_CHARS): string {
  return value.length > max ? `${value.slice(0, max)}\n\n[truncated]` : value;
}

function safeHintPath(path: string): string | null {
  const cleaned = path.trim().replace(/^['"`]+|['"`]+$/g, "");
  if (!cleaned || cleaned.includes("\0")) return null;
  if (cleaned.startsWith("/") || cleaned.split("/").includes("..")) return null;
  if (!/[./]/.test(cleaned)) return null;
  return cleaned;
}

function promptPathHints(prompt: string): string[] {
  const candidates = new Set<string>();
  const patterns = [
    /`([^`]+\.[A-Za-z0-9]{1,12})`/g,
    /\b((?:app|components|lib|convex|src|pages|docs|tests|scripts)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,12})\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of prompt.matchAll(pattern)) {
      const safe = safeHintPath(match[1]);
      if (safe) candidates.add(safe);
    }
  }
  return Array.from(candidates).slice(0, 4);
}

async function maybeReadFile(args: {
  auth: GitHubAuth;
  ref: RepoRef;
  baseBranch: string;
  path: string;
}): Promise<CodexContextExcerpt | null> {
  const file = await getFile(args.auth, args.ref, {
    branch: args.baseBranch,
    path: args.path,
  }).catch(() => null);
  if (!file) return null;
  return { path: args.path, content: truncate(file.content) };
}

async function fetchNiaResearchExcerpt(args: {
  targetRepo: string;
  prompt: string;
}): Promise<CodexContextExcerpt | null> {
  const apiKey = process.env.NIA_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const result = await callRemoteTool(
      NIA_MCP_URL,
      "nia_research",
      {
        query: [
          `Index or search https://github.com/${args.targetRepo} for this Arbor codex-writer implementation task.`,
          "Return the most relevant files, constraints, and repo facts. Prefer concrete paths.",
          "",
          args.prompt,
        ].join("\n"),
        mode: "quick",
        num_results: 5,
      },
      20_000,
      apiKey,
    );
    const content = flattenToolResult(result).trim();
    if (!content) return null;
    return { path: "nia_research.txt", content: truncate(content) };
  } catch {
    return null;
  }
}

export async function fetchCodexContextExcerpts(args: {
  targetRepo: string;
  prompt: string;
  auth: GitHubAuth;
  ref: RepoRef;
  baseBranch: string;
}): Promise<CodexContextExcerpt[]> {
  const seen = new Set<string>();
  const excerpts: CodexContextExcerpt[] = [];

  async function add(excerpt: Promise<CodexContextExcerpt | null> | CodexContextExcerpt | null) {
    const resolved = await excerpt;
    if (!resolved || seen.has(resolved.path)) return;
    seen.add(resolved.path);
    excerpts.push(resolved);
  }

  await add(fetchNiaResearchExcerpt(args));

  for (const path of [
    ...promptPathHints(args.prompt),
    "README.md",
    "package.json",
    "pyproject.toml",
  ]) {
    if (excerpts.length >= MAX_EXCERPTS) break;
    await add(
      maybeReadFile({
        auth: args.auth,
        ref: args.ref,
        baseBranch: args.baseBranch,
        path,
      }),
    );
  }

  return excerpts.slice(0, MAX_EXCERPTS);
}
