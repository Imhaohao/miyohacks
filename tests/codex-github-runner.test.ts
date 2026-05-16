import assert from "node:assert/strict";
import test from "node:test";
import { runCodexViaGitHub } from "../lib/codex-github-runner";

type FetchCall = {
  url: string;
  method: string;
  body?: Record<string, unknown>;
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function basePatch(files: Array<Record<string, unknown>>) {
  return {
    summary: "Update project files",
    final_message: "Done.",
    files,
  };
}

async function withRunnerMock<T>(args: {
  patch: Record<string, unknown>;
  putFailures?: Set<string>;
  branchCollisions?: number;
  run: (calls: FetchCall[]) => Promise<T>;
}) {
  const originalFetch = globalThis.fetch;
  const originalGithub = process.env.GITHUB_TOKEN;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalMaxFiles = process.env.CODEX_MAX_FILES_PER_PR;
  const calls: FetchCall[] = [];
  let branchChecks = 0;
  process.env.GITHUB_TOKEN = "ghp_test";
  process.env.OPENAI_API_KEY = "sk-test";

  globalThis.fetch = (async (url, init) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    calls.push({ url: u, method, body });

    if (u === "https://api.github.com/repos/owner/repo") {
      return json({ default_branch: "main", permissions: { push: true } });
    }
    if (u.includes("/branches/main")) {
      return json({ commit: { sha: "base-sha" } });
    }
    if (u.includes("/branches/arbor%2Fcodex%2F")) {
      branchChecks += 1;
      if (branchChecks <= (args.branchCollisions ?? 0)) {
        return json({ commit: { sha: "existing-branch" } });
      }
      return json({ message: "Not Found" }, { status: 404 });
    }
    if (u === "https://api.openai.com/v1/responses") {
      return json({ output_text: JSON.stringify(args.patch) });
    }
    if (u.endsWith("/git/refs")) {
      return json({ ref: body?.ref });
    }
    if (u.includes("/contents/") && method === "GET") {
      return json({
        type: "file",
        encoding: "base64",
        sha: "file-sha",
        content: Buffer.from("old", "utf-8").toString("base64"),
      });
    }
    if (u.includes("/contents/") && method === "PUT") {
      const path = decodeURIComponent(u.split("/contents/")[1] ?? "");
      if (args.putFailures?.has(path)) {
        return json({ message: "put failed" }, { status: 422 });
      }
      return json({ commit: { sha: `commit-${path}` } });
    }
    if (u.endsWith("/pulls")) {
      return json({
        html_url: "https://github.com/owner/repo/pull/12",
        number: 12,
        node_id: "node12",
      });
    }
    if (u.endsWith("/issues/12/labels")) {
      return json({});
    }
    return json({ message: `unhandled ${u}` }, { status: 500 });
  }) as typeof fetch;

  try {
    return await args.run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGithub === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithub;
    if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAI;
    if (originalMaxFiles === undefined) delete process.env.CODEX_MAX_FILES_PER_PR;
    else process.env.CODEX_MAX_FILES_PER_PR = originalMaxFiles;
  }
}

test("empty OpenAI files are rejected before PR creation", async () => {
  await assert.rejects(
    () =>
      withRunnerMock({
        patch: basePatch([]),
        run: async () =>
          await runCodexViaGitHub({
            agent_id: "codex-writer",
            prompt: "Update README",
            task_type: "implementation",
            target_repo: "owner/repo",
            context_excerpts: [],
          }),
      }),
    /refusing to open empty PR/,
  );
});

test("file cap trims patches and notes final message", async () => {
  const originalMaxFiles = process.env.CODEX_MAX_FILES_PER_PR;
  process.env.CODEX_MAX_FILES_PER_PR = "1";
  try {
    await withRunnerMock({
      patch: basePatch([
        { path: "a.md", action: "create", new_content: "a", reason: "A" },
        { path: "b.md", action: "create", new_content: "b", reason: "B" },
      ]),
      run: async (calls) => {
        const result = await runCodexViaGitHub({
          agent_id: "codex-writer",
          prompt: "Add files",
          task_type: "implementation",
          target_repo: "owner/repo",
          context_excerpts: [],
        });
        assert.equal(result.files.length, 1);
        assert.match(result.final_message, /safety cap/);
        assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
      },
    });
  } finally {
    if (originalMaxFiles === undefined) delete process.env.CODEX_MAX_FILES_PER_PR;
    else process.env.CODEX_MAX_FILES_PER_PR = originalMaxFiles;
  }
});

test("one file write can fail while another opens the PR", async () => {
  await withRunnerMock({
    putFailures: new Set(["bad.md"]),
    patch: basePatch([
      { path: "bad.md", action: "create", new_content: "bad", reason: "bad" },
      { path: "good.md", action: "create", new_content: "good", reason: "good" },
    ]),
    run: async () => {
      const result = await runCodexViaGitHub({
        agent_id: "codex-writer",
        prompt: "Add files",
        task_type: "implementation",
        target_repo: "owner/repo",
        context_excerpts: [],
      });
      assert.equal(result.pr_url, "https://github.com/owner/repo/pull/12");
      assert.equal(result.files[0].status, "failed");
      assert.equal(result.files[1].status, "applied");
    },
  });
});

test("all failed writes abort PR creation", async () => {
  await assert.rejects(
    () =>
      withRunnerMock({
        putFailures: new Set(["bad.md"]),
        patch: basePatch([
          { path: "bad.md", action: "create", new_content: "bad", reason: "bad" },
        ]),
        run: async () =>
          await runCodexViaGitHub({
            agent_id: "codex-writer",
            prompt: "Add file",
            task_type: "implementation",
            target_repo: "owner/repo",
            context_excerpts: [],
          }),
      }),
    /all writes failed/,
  );
});

test("path traversal is rejected", async () => {
  await assert.rejects(
    () =>
      withRunnerMock({
        patch: basePatch([
          {
            path: "../etc/passwd",
            action: "create",
            new_content: "nope",
            reason: "bad",
          },
        ]),
        run: async () =>
          await runCodexViaGitHub({
            agent_id: "codex-writer",
            prompt: "Add file",
            task_type: "implementation",
            target_repo: "owner/repo",
            context_excerpts: [],
          }),
      }),
    /unsafe path traversal/,
  );
});

test("branch name collisions retry with suffix", async () => {
  const originalNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    await withRunnerMock({
      branchCollisions: 1,
      patch: basePatch([
        { path: "README.md", action: "update", new_content: "new", reason: "update" },
      ]),
      run: async (calls) => {
        const result = await runCodexViaGitHub({
          agent_id: "codex-writer",
          prompt: "Update README",
          task_type: "implementation",
          target_repo: "owner/repo",
          context_excerpts: [],
          task_id: "task12345678",
        });
        assert.equal(result.branch, "arbor/codex/12345678-loyw3v28-2");
        const create = calls.find((call) => call.url.endsWith("/git/refs"));
        assert.equal(create?.body?.ref, "refs/heads/arbor/codex/12345678-loyw3v28-2");
      },
    });
  } finally {
    Date.now = originalNow;
  }
});
