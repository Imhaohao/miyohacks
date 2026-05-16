import assert from "node:assert/strict";
import test from "node:test";
import {
  GitHubError,
  openPullRequest,
  parseRepo,
  putFile,
} from "../lib/github";

function mockJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

test("parseRepo parses supported GitHub repo shapes", () => {
  assert.deepEqual(parseRepo("owner/repo"), { owner: "owner", repo: "repo" });
  assert.deepEqual(parseRepo("https://github.com/owner/repo"), {
    owner: "owner",
    repo: "repo",
  });
  assert.deepEqual(parseRepo("https://github.com/owner/repo.git"), {
    owner: "owner",
    repo: "repo",
  });
  assert.deepEqual(parseRepo("git@github.com:owner/repo.git"), {
    owner: "owner",
    repo: "repo",
  });
  assert.throws(() => parseRepo("garbage"), /invalid GitHub repo/);
});

test("GitHubError captures status and body", () => {
  const err = new GitHubError(418, "short and stout", "teapot");
  assert.equal(err.status, 418);
  assert.equal(err.body, "short and stout");
  assert.equal(err.message, "teapot");
});

test("putFile sends base64 content and omits sha for creates", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return mockJsonResponse({ commit: { sha: "commit123" } });
  }) as typeof fetch;

  try {
    const result = await putFile(
      { token: "ghp_test" },
      { owner: "owner", repo: "repo" },
      {
        branch: "main",
        path: "src/hello world.ts",
        message: "create",
        content: "hello",
      },
    );

    assert.equal(result.commit_sha, "commit123");
    assert.equal(calls[0].url, "https://api.github.com/repos/owner/repo/contents/src/hello%20world.ts");
    assert.equal(calls[0].body.content, Buffer.from("hello", "utf-8").toString("base64"));
    assert.equal(calls[0].body.branch, "main");
    assert.equal("sha" in calls[0].body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("putFile includes sha for updates", async () => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return mockJsonResponse({ commit: { sha: "commit456" } });
  }) as typeof fetch;

  try {
    await putFile(
      { token: "ghp_test" },
      { owner: "owner", repo: "repo" },
      {
        branch: "main",
        path: "README.md",
        message: "update",
        content: "updated",
        sha: "file123",
      },
    );
    assert.equal(body?.sha, "file123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("openPullRequest posts documented body and applies labels separately", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method?: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    if (String(url).endsWith("/pulls")) {
      return mockJsonResponse({
        html_url: "https://github.com/owner/repo/pull/7",
        number: 7,
        node_id: "node7",
      });
    }
    return mockJsonResponse({});
  }) as typeof fetch;

  try {
    const pr = await openPullRequest(
      { token: "ghp_test" },
      { owner: "owner", repo: "repo" },
      {
        title: "Fix thing",
        body: "Body",
        head: "arbor/codex/test",
        base: "main",
        labels: ["arbor-codex"],
      },
    );

    assert.equal(pr.number, 7);
    assert.deepEqual(calls[0], {
      url: "https://api.github.com/repos/owner/repo/pulls",
      method: "POST",
      body: {
        title: "Fix thing",
        body: "Body",
        head: "arbor/codex/test",
        base: "main",
        draft: false,
      },
    });
    assert.equal(calls[1].url, "https://api.github.com/repos/owner/repo/issues/7/labels");
    assert.deepEqual(calls[1].body, { labels: ["arbor-codex"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
