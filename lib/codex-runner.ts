export interface CodexRunRequest {
  agent_id: string;
  prompt: string;
  task_type: string;
}

export interface CodexRunResponse {
  mode: "remote" | "local";
  workspace: string;
  changed_files: string[];
  diff_stat: string;
  final_message: string;
  stdout_tail: string;
  stderr_tail: string;
  elapsed_ms: number;
}

const DEFAULT_TIMEOUT_MS = 165_000;

function tail(text: string, max = 12_000) {
  return text.length > max ? text.slice(-max) : text;
}

async function commandAvailable(command: string) {
  const { spawn } = await import("node:child_process");
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function execFileCapture(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number; input?: string },
) {
  const { spawn } = await import("node:child_process");
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`command timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdout = tail(stdout + String(chunk));
      });
      child.stderr.on("data", (chunk) => {
        stderr = tail(stderr + String(chunk));
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
      child.stdin.end(options.input ?? "");
    },
  );
}

function codexBinary() {
  return process.env.CODEX_EXEC_PATH?.trim() || "codex";
}

function codexArgs(workspace: string, outputFile: string) {
  const args = [
    "exec",
    "--cd",
    workspace,
    "-c",
    'approval_policy="never"',
    "-c",
    "shell_environment_policy.inherit=all",
    "--output-last-message",
    outputFile,
  ];
  const model = process.env.CODEX_EXEC_MODEL?.trim();
  if (model) args.push("--model", model);
  if (process.env.CODEX_DANGEROUS_BYPASS === "true") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("--sandbox", process.env.CODEX_SANDBOX?.trim() || "workspace-write");
  }
  args.push("-");
  return args;
}

function buildCodexPrompt(request: CodexRunRequest) {
  return [
    "You are the real codex-writer execution agent inside Arbor.",
    "Make the requested repo change directly in the working tree.",
    "",
    "Hard rules:",
    "- Inspect the repository before editing.",
    "- Keep edits scoped to the user's goal.",
    "- Do not commit, push, or create a pull request.",
    "- Do not revert unrelated existing changes.",
    "- Run the smallest relevant verification command you can reasonably run.",
    "- If the request is too ambiguous to edit safely, make no edit and explain the blocker.",
    "",
    `Task type: ${request.task_type}`,
    `Agent id: ${request.agent_id}`,
    "",
    "User goal and context:",
    request.prompt,
    "",
    "Final response requirements:",
    "- List files changed.",
    "- Summarize the actual edits.",
    "- List verification commands and their results.",
    "- Call out blockers or assumptions.",
  ].join("\n");
}

export function codexRunnerConfigured() {
  return Boolean(
    process.env.CODEX_RUNNER_URL?.trim() || process.env.CODEX_WORKSPACE_DIR?.trim(),
  );
}

export async function runCodexWriter(
  request: CodexRunRequest,
): Promise<CodexRunResponse> {
  const remoteUrl = process.env.CODEX_RUNNER_URL?.trim();
  if (remoteUrl) return await runRemoteCodex(remoteUrl, request);
  return await runLocalCodex(request);
}

async function runRemoteCodex(
  remoteUrl: string,
  request: CodexRunRequest,
): Promise<CodexRunResponse> {
  const started = Date.now();
  const res = await fetch(remoteUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.CODEX_RUNNER_SECRET
        ? { authorization: `Bearer ${process.env.CODEX_RUNNER_SECRET}` }
        : {}),
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(
      Number(process.env.CODEX_RUNNER_HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    ),
  });
  if (!res.ok) {
    throw new Error(`Codex runner HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = (await res.json()) as CodexRunResponse;
  return { ...data, mode: "remote", elapsed_ms: data.elapsed_ms || Date.now() - started };
}

export async function runLocalCodex(
  request: CodexRunRequest,
): Promise<CodexRunResponse> {
  const [{ mkdtemp, readFile, rm, writeFile }, os, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:os"),
    import("node:path"),
  ]);
  const workspace = process.env.CODEX_WORKSPACE_DIR?.trim();
  if (!workspace) throw new Error("CODEX_WORKSPACE_DIR is not set");
  const codex = codexBinary();
  if (!(await commandAvailable(codex))) {
    throw new Error(`Codex executable not found or not runnable: ${codex}`);
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "arbor-codex-"));
  const outputFile = path.join(tempDir, "last-message.md");
  const started = Date.now();
  try {
    await writeFile(outputFile, "", "utf8");
    const before = await execFileCapture("git", ["status", "--short"], {
      cwd: workspace,
      timeoutMs: 10_000,
    });
    const result = await execFileCapture(codex, codexArgs(workspace, outputFile), {
      cwd: workspace,
      input: buildCodexPrompt(request),
      timeoutMs: Number(process.env.CODEX_EXEC_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    });
    const [changed, stat, finalMessage] = await Promise.all([
      execFileCapture("git", ["diff", "--name-only"], {
        cwd: workspace,
        timeoutMs: 10_000,
      }),
      execFileCapture("git", ["diff", "--stat"], {
        cwd: workspace,
        timeoutMs: 10_000,
      }),
      readFile(outputFile, "utf8").catch(() => ""),
    ]);
    const changedFiles = changed.stdout
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean);

    if (result.code !== 0) {
      throw new Error(
        [
          `Codex exited with code ${result.code}.`,
          `stdout:\n${tail(result.stdout, 2000)}`,
          `stderr:\n${tail(result.stderr, 2000)}`,
        ].join("\n\n"),
      );
    }

    return {
      mode: "local",
      workspace,
      changed_files: changedFiles,
      diff_stat: stat.stdout.trim(),
      final_message: finalMessage.trim(),
      stdout_tail: [
        before.stdout.trim() ? `Initial git status:\n${before.stdout.trim()}` : "",
        tail(result.stdout).trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
      stderr_tail: tail(result.stderr).trim(),
      elapsed_ms: Date.now() - started,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
