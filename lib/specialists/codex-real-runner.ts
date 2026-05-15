import type { CodexRunResponse } from "../codex-runner";
import { isImplementationTask } from "../campaign-context";
import { roleForSpecialist } from "../agent-roles";
import type {
  BidPayload,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistOutput,
  SpecialistRunner,
} from "../types";

function configuredMode() {
  if (process.env.CODEX_RUNNER_URL?.trim()) return "remote Codex runner";
  if (process.env.CODEX_WORKSPACE_DIR?.trim()) return "local Codex CLI";
  return null;
}

function codexRunnerConfigured() {
  return Boolean(
    process.env.CODEX_RUNNER_URL?.trim() ||
      process.env.CODEX_WORKSPACE_DIR?.trim(),
  );
}

function runnerHost() {
  const url = process.env.CODEX_RUNNER_URL?.trim();
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

async function loadCodexRunner() {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<typeof import("../codex-runner")>;
  return await dynamicImport("../codex-runner");
}

function formatCodexResult(result: CodexRunResponse) {
  return [
    "# Codex execution result",
    "",
    `Mode: ${result.mode}`,
    `Workspace: ${result.workspace}`,
    `Elapsed: ${Math.round(result.elapsed_ms / 1000)}s`,
    "",
    "## Files changed",
    result.changed_files.length
      ? result.changed_files.map((file) => `- ${file}`).join("\n")
      : "No tracked file changes were produced.",
    "",
    "## Diff stat",
    result.diff_stat ? `\`\`\`\n${result.diff_stat}\n\`\`\`` : "No diff stat.",
    "",
    "## Codex final message",
    result.final_message || "(Codex did not write a final message.)",
    result.stderr_tail
      ? ["", "## Runner stderr tail", "```", result.stderr_tail, "```"].join("\n")
      : "",
    result.stdout_tail
      ? ["", "## Runner stdout tail", "```", result.stdout_tail, "```"].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function makeCodexWriterSpecialist(
  config: SpecialistConfig,
): SpecialistRunner {
  return {
    config,
    async bid(prompt: string, taskType: string): Promise<SpecialistDecision> {
      if (!isImplementationTask(prompt, taskType)) {
        return {
          decline: true,
          reason: "codex-writer only bids on software/repo implementation tasks.",
        };
      }

      const mode = configuredMode();
      if (!mode || !codexRunnerConfigured()) {
        return {
          decline: true,
          reason:
            "Real Codex execution is not configured. Set CODEX_RUNNER_URL or CODEX_WORKSPACE_DIR before allowing codex-writer to bid.",
        };
      }

      const bid: BidPayload = {
        bid_price: config.cost_baseline,
        capability_claim: `I will run ${mode} against the configured checkout, make scoped repo edits, and return changed files plus verification results.`,
        estimated_seconds: 1800,
        agent_role: roleForSpecialist(config),
        execution_preview:
          "Real repo-editing run: Codex receives the approved task/context, edits the working tree, and returns git diff evidence.",
        tool_availability: {
          status: "available",
          checked: [
            process.env.CODEX_RUNNER_URL?.trim()
              ? "CODEX_RUNNER_URL"
              : "CODEX_WORKSPACE_DIR",
          ],
          reason: `${mode} configured`,
          protocol: "arbor_a2a_bridge",
          execution_status: "arbor_real_adapter",
          endpoint_host: runnerHost(),
          proof: mode,
        },
      };
      return bid;
    },
    async execute(prompt: string, taskType: string): Promise<SpecialistOutput> {
      if (!isImplementationTask(prompt, taskType)) {
        throw new Error("codex-writer cannot execute non-implementation tasks");
      }
      if (!codexRunnerConfigured()) {
        throw new Error(
          "Real Codex execution is not configured. Set CODEX_RUNNER_URL or CODEX_WORKSPACE_DIR.",
        );
      }
      const { runCodexWriter } = await loadCodexRunner();
      const result = await runCodexWriter({
        agent_id: config.agent_id,
        prompt,
        task_type: taskType,
      });
      return formatCodexResult(result);
    },
  };
}
