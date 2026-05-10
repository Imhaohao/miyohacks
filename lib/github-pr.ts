const API = "https://api.github.com";

export interface RepoRef {
  owner: string;
  repo: string;
}

export function parseRepoUrl(url: string): RepoRef | null {
  const match = url.match(/github\.com\/([^/\s]+)\/([^/\s.]+)(?:\.git)?\/?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

interface GhRequestInit extends RequestInit {
  token: string;
}

async function gh<T>(path: string, init: GhRequestInit): Promise<{ status: number; body: T | string; raw: string }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${init.token}`,
      accept: "application/vnd.github+json",
      "user-agent": "arbor-demo",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: T | string = text;
  if (text && (res.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = text;
    }
  }
  return { status: res.status, body, raw: text };
}

function describeBody(body: unknown, raw: string): string {
  if (typeof body === "string") return body.slice(0, 300);
  return raw.slice(0, 300);
}

export async function getAuthenticatedUser(token: string): Promise<string> {
  const r = await gh<{ login: string }>("/user", { method: "GET", token });
  if (r.status !== 200 || typeof r.body === "string") {
    throw new Error(`getAuthenticatedUser HTTP ${r.status}: ${describeBody(r.body, r.raw)}`);
  }
  return r.body.login;
}

export async function getRepo(
  ref: RepoRef,
  token: string,
): Promise<{ default_branch: string; permissions: { push?: boolean; admin?: boolean } }> {
  const r = await gh<{ default_branch: string; permissions: { push?: boolean; admin?: boolean } }>(
    `/repos/${ref.owner}/${ref.repo}`,
    { method: "GET", token },
  );
  if (r.status !== 200 || typeof r.body === "string") {
    throw new Error(`getRepo ${ref.owner}/${ref.repo} HTTP ${r.status}: ${describeBody(r.body, r.raw)}`);
  }
  return r.body;
}

/**
 * Returns the fork's owner login. Creates the fork if needed and waits until
 * GitHub finishes provisioning it (forks are async on the server side).
 */
export async function ensureFork(upstream: RepoRef, token: string): Promise<string> {
  const me = await getAuthenticatedUser(token);
  const existing = await gh<{ default_branch: string }>(
    `/repos/${me}/${upstream.repo}`,
    { method: "GET", token },
  );
  if (existing.status === 200) return me;

  const created = await gh<{ full_name: string }>(`/repos/${upstream.owner}/${upstream.repo}/forks`, {
    method: "POST",
    token,
    body: JSON.stringify({}),
  });
  if (created.status !== 202 && created.status !== 200) {
    throw new Error(`fork failed HTTP ${created.status}: ${String(created.body).slice(0, 200)}`);
  }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const probe = await gh(`/repos/${me}/${upstream.repo}`, { method: "GET", token });
    if (probe.status === 200) return me;
  }
  throw new Error("fork did not become available within 30s");
}

export async function syncForkWithUpstream(
  forkOwner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<void> {
  // Best-effort: GitHub's "merge-upstream" endpoint pulls the upstream HEAD into
  // the fork's matching branch. If it fails, we'll just use the fork's stale
  // base — still a valid PR, just diff includes any drift.
  await gh(`/repos/${forkOwner}/${repo}/merge-upstream`, {
    method: "POST",
    token,
    body: JSON.stringify({ branch }),
  });
}

export async function getRefSha(
  ref: RepoRef,
  branch: string,
  token: string,
): Promise<string> {
  const r = await gh<{ object: { sha: string } }>(
    `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${branch}`,
    { method: "GET", token },
  );
  if (r.status !== 200 || typeof r.body === "string") {
    throw new Error(`getRefSha HTTP ${r.status}: ${describeBody(r.body, r.raw)}`);
  }
  return r.body.object.sha;
}

export async function createBranch(
  ref: RepoRef,
  newBranch: string,
  fromSha: string,
  token: string,
): Promise<void> {
  const r = await gh(`/repos/${ref.owner}/${ref.repo}/git/refs`, {
    method: "POST",
    token,
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
  });
  if (r.status !== 201) {
    throw new Error(`createBranch HTTP ${r.status}: ${describeBody(r.body, r.raw)}`);
  }
}

export interface FileContent {
  sha: string;
  contentBase64: string;
  decoded: string;
}

export async function getFile(
  ref: RepoRef,
  path: string,
  branch: string,
  token: string,
): Promise<FileContent> {
  const r = await gh<{ content: string; encoding: string; sha: string }>(
    `/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
    { method: "GET", token },
  );
  if (r.status !== 200 || typeof r.body === "string") {
    throw new Error(`getFile ${path} HTTP ${r.status}: ${describeBody(r.body, r.raw)}`);
  }
  const contentBase64 = r.body.content.replace(/\s/g, "");
  const decoded = Buffer.from(contentBase64, "base64").toString("utf-8");
  return { sha: r.body.sha, contentBase64, decoded };
}

export async function commitFile(args: {
  ref: RepoRef;
  branch: string;
  path: string;
  content: string;
  message: string;
  fileSha: string;
  token: string;
}): Promise<void> {
  const r = await gh(`/repos/${args.ref.owner}/${args.ref.repo}/contents/${encodeURI(args.path)}`, {
    method: "PUT",
    token: args.token,
    body: JSON.stringify({
      message: args.message,
      content: Buffer.from(args.content, "utf-8").toString("base64"),
      sha: args.fileSha,
      branch: args.branch,
    }),
  });
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`commitFile HTTP ${r.status}: ${describeBody(r.body, r.raw)}`);
  }
}

export async function openCrossRepoPR(args: {
  upstream: RepoRef;
  forkOwner: string;
  branch: string;
  base: string;
  title: string;
  body: string;
  token: string;
}): Promise<{ url: string; number: number }> {
  const r = await gh<{ html_url: string; number: number }>(
    `/repos/${args.upstream.owner}/${args.upstream.repo}/pulls`,
    {
      method: "POST",
      token: args.token,
      body: JSON.stringify({
        title: args.title,
        body: args.body,
        head: `${args.forkOwner}:${args.branch}`,
        base: args.base,
        maintainer_can_modify: true,
      }),
    },
  );
  if (r.status !== 201 || typeof r.body === "string") {
    throw new Error(`openPR HTTP ${r.status}: ${describeBody(r.body, r.raw)}`);
  }
  return { url: r.body.html_url, number: r.body.number };
}
