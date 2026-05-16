"use node";

export interface GitHubAuth {
  token?: string;
  appId?: string;
  privateKey?: string;
  installationId?: string;
}

export interface RepoRef {
  owner: string;
  repo: string;
}

export class GitHubError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string, message: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.body = body;
  }
}

const GITHUB_API_BASE = "https://api.github.com";
const USER_AGENT = "arbor-codex-writer";
const MAX_CONTENTS_API_BYTES = 1_000_000;

function cleanRepoName(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function parseOwnerRepo(owner: string, repo: string): RepoRef {
  const cleanOwner = owner.trim();
  const cleanRepo = cleanRepoName(repo.trim());
  if (
    !/^[A-Za-z0-9_.-]+$/.test(cleanOwner) ||
    !/^[A-Za-z0-9_.-]+$/.test(cleanRepo)
  ) {
    throw new Error(`invalid GitHub repo: ${owner}/${repo}`);
  }
  return { owner: cleanOwner, repo: cleanRepo };
}

export function parseRepo(input: string): RepoRef {
  const value = input.trim();
  const shorthand = value.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+(?:\.git)?)$/);
  if (shorthand) return parseOwnerRepo(shorthand[1], shorthand[2]);

  const ssh = value.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+(?:\.git)?)$/);
  if (ssh) return parseOwnerRepo(ssh[1], ssh[2]);

  try {
    const url = new URL(value);
    if (url.hostname !== "github.com") {
      throw new Error("not github.com");
    }
    const [owner, repo] = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);
    if (owner && repo) return parseOwnerRepo(owner, repo);
  } catch {
    // Fall through to the canonical error below.
  }

  throw new Error(
    `invalid GitHub repo "${input}"; expected owner/repo, GitHub URL, or git@github.com:owner/repo.git`,
  );
}

export function authFromEnv(): GitHubAuth {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) return { token };

  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();
  if (appId && privateKey && installationId) {
    return { appId, privateKey, installationId };
  }

  throw new Error("GITHUB_TOKEN is not set");
}

function pathForContents(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function headers(auth: GitHubAuth): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": USER_AGENT,
  };
  if (auth.token) h.authorization = `Bearer ${auth.token}`;
  return h;
}

async function githubRequest<T>(
  auth: GitHubAuth,
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; response: Response }> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers(auth),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const reset = response.headers.get("x-ratelimit-reset");
    const remaining = response.headers.get("x-ratelimit-remaining");
    const parsedMessage = parseGitHubErrorMessage(body);
    const rateLimit =
      (response.status === 403 || response.status === 429) && remaining === "0"
        ? ` GitHub rate limit exhausted${reset ? ` until ${new Date(Number(reset) * 1000).toISOString()}` : ""}.`
        : "";
    throw new GitHubError(
      response.status,
      body,
      `GitHub API error ${response.status}: ${parsedMessage}${rateLimit}`,
    );
  }

  return { data: (await response.json()) as T, response };
}

function parseGitHubErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    return parsed.message ?? body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

export async function getRepo(
  auth: GitHubAuth,
  ref: RepoRef,
): Promise<{ default_branch: string; permissions?: { push?: boolean } }> {
  const { data } = await githubRequest<{
    default_branch: string;
    permissions?: { push?: boolean };
  }>(auth, `/repos/${ref.owner}/${ref.repo}`);
  return data;
}

export async function getBranchSha(
  auth: GitHubAuth,
  ref: RepoRef,
  branch: string,
): Promise<string> {
  const { data } = await githubRequest<{ commit?: { sha?: string } }>(
    auth,
    `/repos/${ref.owner}/${ref.repo}/branches/${encodeURIComponent(branch)}`,
  );
  const sha = data.commit?.sha;
  if (!sha) throw new Error(`GitHub branch ${branch} has no commit sha`);
  return sha;
}

export async function createBranch(
  auth: GitHubAuth,
  ref: RepoRef,
  newBranch: string,
  fromSha: string,
): Promise<void> {
  await githubRequest(auth, `/repos/${ref.owner}/${ref.repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${newBranch}`,
      sha: fromSha,
    }),
  });
}

export async function branchExists(
  auth: GitHubAuth,
  ref: RepoRef,
  branch: string,
): Promise<boolean> {
  try {
    await getBranchSha(auth, ref, branch);
    return true;
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return false;
    throw err;
  }
}

export async function getFile(
  auth: GitHubAuth,
  ref: RepoRef,
  args: { branch: string; path: string },
): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await githubRequest<{
      content?: string;
      encoding?: string;
      sha?: string;
      size?: number;
      type?: string;
    }>(
      auth,
      `/repos/${ref.owner}/${ref.repo}/contents/${pathForContents(args.path)}?ref=${encodeURIComponent(args.branch)}`,
    );
    if (data.size && data.size > MAX_CONTENTS_API_BYTES) {
      throw new GitHubError(
        413,
        "",
        "file too large for Contents API - Git Data API not implemented in this pass",
      );
    }
    if (data.type !== "file" || data.encoding !== "base64" || !data.content || !data.sha) {
      throw new Error(`GitHub contents response for ${args.path} is not a file`);
    }
    return {
      content: Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}

export async function putFile(
  auth: GitHubAuth,
  ref: RepoRef,
  args: {
    branch: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
  },
): Promise<{ commit_sha: string }> {
  if (Buffer.byteLength(args.content, "utf-8") > MAX_CONTENTS_API_BYTES) {
    throw new GitHubError(
      413,
      "",
      "file too large for Contents API - Git Data API not implemented in this pass",
    );
  }
  const body = {
    message: args.message,
    content: Buffer.from(args.content, "utf-8").toString("base64"),
    branch: args.branch,
    ...(args.sha ? { sha: args.sha } : {}),
  };
  const { data } = await githubRequest<{ commit?: { sha?: string } }>(
    auth,
    `/repos/${ref.owner}/${ref.repo}/contents/${pathForContents(args.path)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
  return { commit_sha: data.commit?.sha ?? "" };
}

export async function deleteFile(
  auth: GitHubAuth,
  ref: RepoRef,
  args: {
    branch: string;
    path: string;
    message: string;
    sha: string;
  },
): Promise<void> {
  await githubRequest(auth, `/repos/${ref.owner}/${ref.repo}/contents/${pathForContents(args.path)}`, {
    method: "DELETE",
    body: JSON.stringify({
      message: args.message,
      sha: args.sha,
      branch: args.branch,
    }),
  });
}

export async function openPullRequest(
  auth: GitHubAuth,
  ref: RepoRef,
  args: {
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
    labels?: string[];
  },
): Promise<{ html_url: string; number: number; node_id: string }> {
  let pr: { html_url: string; number: number; node_id: string };
  try {
    const { data } = await githubRequest<typeof pr>(
      auth,
      `/repos/${ref.owner}/${ref.repo}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: args.title,
          body: args.body,
          head: args.head,
          base: args.base,
          draft: Boolean(args.draft),
        }),
      },
    );
    pr = data;
  } catch (err) {
    if (err instanceof GitHubError) {
      throw new GitHubError(err.status, err.body, `PR creation failed: ${err.message}`);
    }
    throw err;
  }

  if (args.labels?.length) {
    await githubRequest(auth, `/repos/${ref.owner}/${ref.repo}/issues/${pr.number}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels: args.labels }),
    });
  }

  return pr;
}
