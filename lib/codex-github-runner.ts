"use node";

import { fetchCodexContextExcerpts, type CodexContextExcerpt } from "./codex-context";
import {
  authFromEnv,
  branchExists,
  createBranch,
  getBranchSha,
  getFile,
  getRepo,
  GitHubError,
  openPullRequest,
  parseRepo,
  putFile,
  deleteFile,
} from "./github";
import { callOpenAIJSON } from "./openai";

export interface CodexGitHubRunRequest {
  agent_id: string;
  prompt: string;
  task_type: string;
  target_repo: string;
  base_branch?: string;
  task_id?: string;
  context_excerpts?: CodexContextExcerpt[];
  task_context_packet?: string;
  acceptance_criteria?: string[];
}

export interface CodexGitHubFileResult {
  path: string;
  action: "create" | "update" | "delete";
  bytes_after: number;
  status: "applied" | "failed";
  error?: string;
}

export interface CodexGitHubRunResponse {
  mode: "github_pr";
  pr_url: string;
  pr_number: number;
  branch: string;
  base_branch: string;
  files: CodexGitHubFileResult[];
  summary: string;
  final_message: string;
  elapsed_ms: number;
}

type PatchFile = {
  path: string;
  action: "create" | "update" | "delete";
  new_content?: string | null;
  reason: string;
};

interface CodexPatch {
  summary: string;
  final_message: string;
  files: PatchFile[];
}

const PATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "final_message", "files"],
  properties: {
    summary: { type: "string" },
    final_message: { type: "string" },
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "action", "reason", "new_content"],
        properties: {
          path: { type: "string" },
          action: { type: "string", enum: ["create", "update", "delete"] },
          new_content: { type: ["string", "null"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

function maxFilesPerPr(): number {
  const raw = Number(process.env.CODEX_MAX_FILES_PER_PR ?? 20);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

function validatePath(path: string) {
  if (!path.trim()) throw new Error("Codex proposed an empty file path");
  if (path.startsWith("/") || path.includes("\0") || path.split("/").includes("..")) {
    throw new Error(`Codex proposed unsafe path traversal: ${path}`);
  }
}

function validatePatchFile(file: PatchFile) {
  validatePath(file.path);
  if (file.action !== "delete" && typeof file.new_content !== "string") {
    throw new Error(`Codex proposed ${file.action} for ${file.path} without new_content`);
  }
}

function systemPrompt(owner: string, repo: string): string {
  return [
    "You are codex-writer, a specialist agent powered by OpenAI Codex.",
    "Your strength is generating scoped, idiomatic code changes from an approved implementation task.",
    "",
    `Buyer has approved an implementation plan and has granted Arbor write access to the GitHub repo ${owner}/${repo}.`,
    "You must return a structured patch only - no prose outside the JSON.",
    "Rules:",
    "- Touch the smallest set of files needed.",
    "- Preserve existing patterns (look at the provided excerpts).",
    "- new_content must be the COMPLETE file contents after your edit, not a diff.",
    "- Never modify .env files, secrets, or lockfiles unless explicitly asked.",
    "- If you cannot complete the task safely with the available context, return an empty files array and explain why in final_message.",
  ].join("\n");
}

function userPrompt(request: CodexGitHubRunRequest, repo: string, baseBranch: string) {
  const sections = [
    "Task prompt:",
    request.prompt,
    "",
    `Task type: ${request.task_type}`,
    `Target repo: ${repo}; base branch: ${baseBranch}`,
  ];
  if (request.task_context_packet?.trim()) {
    sections.push("", "Task context packet:", request.task_context_packet.trim());
  }
  if (request.acceptance_criteria?.length) {
    sections.push(
      "",
      "Acceptance criteria:",
      ...request.acceptance_criteria.map((criterion) => `- ${criterion}`),
    );
  }
  if (request.context_excerpts?.length) {
    sections.push(
      "",
      "Context excerpts:",
      ...request.context_excerpts.map(
        (excerpt) => `\n--- ${excerpt.path} ---\n${excerpt.content}`,
      ),
    );
  }
  return sections.join("\n");
}

function prTitle(summary: string) {
  const title = summary.split("\n")[0]?.trim() || "Arbor Codex changes";
  return title.slice(0, 70);
}

function branchBase(taskId: string | undefined) {
  const taskIdShort = (taskId ?? "no-task").slice(-8);
  return `arbor/codex/${taskIdShort}-${Date.now().toString(36)}`;
}

function repoErrorMessage(err: unknown, owner: string, repo: string): never {
  if (err instanceof GitHubError && err.status === 404) {
    throw new Error(`GitHub repo ${owner}/${repo} not accessible with current token (404)`);
  }
  throw err instanceof Error ? err : new Error(String(err));
}

export async function runCodexViaGitHub(
  request: CodexGitHubRunRequest,
): Promise<CodexGitHubRunResponse> {
  const started = Date.now();
  if (!process.env.GITHUB_TOKEN?.trim()) throw new Error("GITHUB_TOKEN is not set");
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is not set");
  const targetRepo = request.target_repo?.trim();
  if (!targetRepo) {
    throw new Error("target_repo is required: pass on the task or set CODEX_DEFAULT_TARGET_REPO");
  }

  const auth = authFromEnv();
  const ref = parseRepo(targetRepo);
  const meta = await getRepo(auth, ref).catch((err) =>
    repoErrorMessage(err, ref.owner, ref.repo),
  );
  if (meta.permissions?.push === false) {
    throw new Error(`Token lacks push permission on ${ref.owner}/${ref.repo}`);
  }
  const baseBranch =
    request.base_branch?.trim() ??
    process.env.CODEX_DEFAULT_BASE_BRANCH?.trim() ??
    meta.default_branch;
  const baseSha = await getBranchSha(auth, ref, baseBranch);
  const contextExcerpts =
    request.context_excerpts ??
    (await fetchCodexContextExcerpts({
      targetRepo: `${ref.owner}/${ref.repo}`,
      prompt: request.prompt,
      auth,
      ref,
      baseBranch,
    }).catch(() => []));

  const patch = await callOpenAIJSON<CodexPatch>({
    model: process.env.CODEX_OPENAI_MODEL?.trim() || undefined,
    systemPrompt: systemPrompt(ref.owner, ref.repo),
    userPrompt: userPrompt(
      { ...request, context_excerpts: contextExcerpts },
      `${ref.owner}/${ref.repo}`,
      baseBranch,
    ),
    maxTokens: 12_000,
    timeoutMs: 90_000,
    retries: 0,
    responseFormat: {
      type: "json_schema",
      name: "codex_patch",
      strict: true,
      schema: PATCH_SCHEMA,
    },
  });

  if (!patch.files.length) {
    throw new Error("Codex produced no file changes; refusing to open empty PR");
  }

  for (const file of patch.files) validatePatchFile(file);

  const maxFiles = maxFilesPerPr();
  let files = patch.files;
  let finalMessage = patch.final_message;
  if (files.length > maxFiles) {
    files = files.slice(0, maxFiles);
    finalMessage = `${finalMessage}\n\nArbor safety cap: Codex proposed ${patch.files.length} files, so only the first ${maxFiles} were applied.`;
  }

  const base = branchBase(request.task_id);
  let branch = base;
  let suffix = 1;
  while (await branchExists(auth, ref, branch)) {
    branch = `${base}-${++suffix}`;
    if (suffix > 5) throw new Error("could not find unused branch name");
  }
  await createBranch(auth, ref, branch, baseSha);

  const results: CodexGitHubFileResult[] = [];
  for (const file of files) {
    try {
      if (file.action === "delete") {
        const existing = await getFile(auth, ref, { branch, path: file.path });
        if (!existing) {
          results.push({
            path: file.path,
            action: file.action,
            bytes_after: 0,
            status: "failed",
            error: "file not present on base branch",
          });
          continue;
        }
        await deleteFile(auth, ref, {
          branch,
          path: file.path,
          sha: existing.sha,
          message: `arbor-codex: delete ${file.path}`,
        });
        results.push({
          path: file.path,
          action: file.action,
          bytes_after: 0,
          status: "applied",
        });
      } else {
        if (typeof file.new_content !== "string") {
          results.push({
            path: file.path,
            action: file.action,
            bytes_after: 0,
            status: "failed",
            error: "new_content missing",
          });
          continue;
        }
        const existing =
          file.action === "update"
            ? await getFile(auth, ref, { branch, path: file.path })
            : null;
        if (file.action === "update" && !existing) {
          results.push({
            path: file.path,
            action: file.action,
            bytes_after: 0,
            status: "failed",
            error: "file not present on base branch",
          });
          continue;
        }
        await putFile(auth, ref, {
          branch,
          path: file.path,
          content: file.new_content,
          sha: existing?.sha,
          message: `arbor-codex: ${file.action} ${file.path}`,
        });
        results.push({
          path: file.path,
          action: file.action,
          bytes_after: file.new_content.length,
          status: "applied",
        });
      }
    } catch (err) {
      results.push({
        path: file.path,
        action: file.action,
        bytes_after: 0,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const appliedCount = results.filter((result) => result.status === "applied").length;
  if (appliedCount === 0) {
    throw new Error(
      `Codex proposed ${results.length} files but all writes failed; aborting PR`,
    );
  }

  const body = [
    "## Task",
    request.prompt,
    "",
    "## Codex final message",
    finalMessage,
    "",
    "## Files changed",
    ...results.map(
      (result) =>
        `- \`${result.action}\` \`${result.path}\` - ${result.status}${result.error ? ` (${result.error})` : ""}`,
    ),
    ...(request.acceptance_criteria?.length
      ? [
          "",
          "## Acceptance criteria",
          ...request.acceptance_criteria.map((criterion) => `- ${criterion}`),
        ]
      : []),
    "",
    `_Generated by Arbor codex-writer for task \`${request.task_id ?? "n/a"}\`_`,
  ].join("\n");

  const pr = await openPullRequest(auth, ref, {
    title: prTitle(patch.summary),
    body,
    head: branch,
    base: baseBranch,
    labels: [process.env.CODEX_PR_LABEL ?? "arbor-codex"],
  });

  return {
    mode: "github_pr",
    pr_url: pr.html_url,
    pr_number: pr.number,
    branch,
    base_branch: baseBranch,
    files: results,
    summary: patch.summary,
    final_message: finalMessage,
    elapsed_ms: Date.now() - started,
  };
}
