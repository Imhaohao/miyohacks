import { isImplementationTask } from "../campaign-context";
import { roleForSpecialist } from "../agent-roles";
import { runCodexViaGitHub, type CodexGitHubRunResponse } from "../codex-github-runner";
import { fetchCodexContextExcerpts } from "../codex-context";
import { authFromEnv, getRepo, parseRepo } from "../github";
import {
  buildPlanUserPrompt,
  EXECUTION_PLAN_JSON_SCHEMA,
} from "../execution-plan";
import { callOpenAIJSON } from "../openai";
import type {
  BidPayload,
  ExecutionPlanLLMResponse,
  ExecutionPlanRequest,
  SpecialistExecuteOpts,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistOutput,
  SpecialistRunner,
} from "../types";

function configuredMode() {
  if (process.env.GITHUB_TOKEN?.trim() && process.env.OPENAI_API_KEY?.trim()) {
    return "Arbor Codex (OpenAI Responses + GitHub PR)";
  }
  return null;
}

function codexRunnerConfigured() {
  return Boolean(configuredMode());
}

function formatCodexGitHubResult(result: CodexGitHubRunResponse) {
  const applied = result.files.filter((file) => file.status === "applied").length;
  return [
    "# Codex execution result (GitHub PR)",
    "",
    `PR: ${result.pr_url}`,
    `Branch: ${result.branch} <- ${result.base_branch}`,
    `Files changed: ${applied}/${result.files.length}`,
    `Elapsed: ${Math.round(result.elapsed_ms / 1000)}s`,
    "",
    "## Files",
    result.files.length
      ? result.files
          .map((file) =>
            file.status === "failed"
              ? `- failed  ${file.path} - ${file.error ?? "write failed"}`
              : `- ${file.action}  ${file.path}  (${file.bytes_after} bytes)`,
          )
          .join("\n")
      : "No files were applied.",
    "",
    "## Summary",
    result.summary,
    "",
    "## Codex final message",
    result.final_message || "(Codex did not write a final message.)",
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
            "codex-writer needs GITHUB_TOKEN (repo scope) and OPENAI_API_KEY before it can open PRs.",
        };
      }

      const bid: BidPayload = {
        bid_price: config.cost_baseline,
        capability_claim: `I will use ${mode} to generate scoped repo edits and open a pull request for buyer review.`,
        estimated_seconds: 1800,
        agent_role: roleForSpecialist(config),
        execution_preview:
          "Real repo-editing run: Codex receives the approved task/context, writes a GitHub branch, and returns a PR URL.",
        tool_availability: {
          status: "available",
          checked: ["GITHUB_TOKEN", "OPENAI_API_KEY"],
          reason: `${mode} configured`,
          protocol: "arbor_a2a_bridge",
          execution_status: "arbor_real_adapter",
          endpoint_host: "api.github.com",
          proof: mode,
        },
      };
      return bid;
    },
    async execute(
      prompt: string,
      taskType: string,
      opts?: SpecialistExecuteOpts,
    ): Promise<SpecialistOutput> {
      if (!isImplementationTask(prompt, taskType)) {
        throw new Error("codex-writer cannot execute non-implementation tasks");
      }
      if (!codexRunnerConfigured()) {
        throw new Error(
          "codex-writer is not configured: set GITHUB_TOKEN and OPENAI_API_KEY.",
        );
      }
      const targetRepo =
        opts?.target_repo ?? process.env.CODEX_DEFAULT_TARGET_REPO?.trim();
      if (!targetRepo) {
        throw new Error(
          "codex-writer needs a target_repo on the task or CODEX_DEFAULT_TARGET_REPO env var.",
        );
      }

      const auth = authFromEnv();
      const ref = parseRepo(targetRepo);
      const repoMeta = await getRepo(auth, ref);
      const baseBranch =
        opts?.target_branch ??
        process.env.CODEX_DEFAULT_BASE_BRANCH ??
        repoMeta.default_branch;

      const excerpts = await fetchCodexContextExcerpts({
        targetRepo,
        prompt,
        auth,
        ref,
        baseBranch,
      }).catch(() => []);

      const result = await runCodexViaGitHub({
        agent_id: config.agent_id,
        prompt,
        task_type: taskType,
        target_repo: targetRepo,
        base_branch: baseBranch,
        task_id: opts?.task_id,
        context_excerpts: excerpts,
        acceptance_criteria: opts?.acceptance_criteria,
      });
      return formatCodexGitHubResult(result);
    },
    async plan(request: ExecutionPlanRequest): Promise<ExecutionPlanLLMResponse> {
      // codex-writer's pre-execution plan is NOT a Codex CLI run (those mutate
      // the working tree and cost money before the buyer has approved
      // anything). Instead use an OpenAI call grounded in codex-writer's own
      // system_prompt + an instruction set that forces concrete repo surfaces
      // — the gap the judge flagged on generic plans.
      const systemPrompt = [
        config.system_prompt,
        "",
        "You are now drafting a PRE-EXECUTION approval plan for the buyer. You have not yet been authorized to touch the workspace and Codex has not been invoked.",
        "Rules:",
        "- Ground every deliverable, context_required item, and acceptance criterion in the attached context packet. If the packet lists files, directories, frameworks, or APIs, name them explicitly.",
        "- Do not list surfaces that are not implied by the user goal or context (no Convex if the project is Supabase, no analytics dashboards if the user did not ask for one).",
        "- If the context packet is empty or missing key files, add a context_required entry naming exactly what Nia/Hyperspell should fetch before execution.",
        "- context_required must include 'GitHub write access to the target repo' and identify the target_repo by owner/name when available.",
        "- Frame yourself as the agent that will perform the edits via OpenAI Responses + a GitHub PR once approved.",
      ].join("\n");
      return await callOpenAIJSON<ExecutionPlanLLMResponse>({
        systemPrompt,
        userPrompt: [
          buildPlanUserPrompt(config, request),
          "",
          "Reminder: this is a software/repo task. Concrete files and directories are mandatory in proposed surfaces; generic categories like 'frontend' or 'backend' are insufficient.",
          "",
          EXECUTION_PLAN_JSON_SCHEMA,
        ].join("\n"),
        maxTokens: 1300,
        timeoutMs: 50_000,
        retries: 0,
      });
    },
  };
}
