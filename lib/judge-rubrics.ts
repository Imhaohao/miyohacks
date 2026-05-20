// Code-level rubrics that mirror the LLM judge's acceptance criteria.
// Used by:
//   - tests/judge-rubrics.test.ts to regression-check known-good and known-bad
//     artifacts without spending OpenAI tokens.
//   - lib/acceptance-harness.ts in "rubric" judge mode so agent-readiness can
//     be checked offline in CI.
// The LLM judge stays the source of truth at runtime. The rubric here is a
// strict-but-shallow shadow that catches the same structural failures.

import { selectJudgeKind, type JudgeKind } from "./judge";
import type {
  CampaignLaunchArtifact,
  ExecutionArtifact,
  ImplementationPlanArtifact,
  ExecutionPlanArtifact,
} from "./types";

export interface RubricVerdict {
  verdict: "accept" | "reject";
  reasoning: string;
  quality_score: number;
  missing: string[];
}

function ok(quality: number, reasoning: string): RubricVerdict {
  return {
    verdict: "accept",
    reasoning,
    quality_score: Math.max(0, Math.min(1, quality)),
    missing: [],
  };
}

function bad(missing: string[], reasoning: string): RubricVerdict {
  return {
    verdict: "reject",
    reasoning,
    quality_score: 0,
    missing,
  };
}

function isArtifact(value: unknown): value is ExecutionArtifact {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in (value as Record<string, unknown>),
  );
}

function asCampaign(value: unknown): CampaignLaunchArtifact | null {
  if (!isArtifact(value)) return null;
  return value.kind === "campaign_launch" ? (value as CampaignLaunchArtifact) : null;
}

function asImplementationPlan(value: unknown): ImplementationPlanArtifact | null {
  if (!isArtifact(value)) return null;
  return value.kind === "implementation_plan"
    ? (value as ImplementationPlanArtifact)
    : null;
}

function asExecutionPlan(value: unknown): ExecutionPlanArtifact | null {
  if (!isArtifact(value)) return null;
  return value.kind === "execution_plan" ? (value as ExecutionPlanArtifact) : null;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value == null ? "" : String(value);
}

const VAGUE_SIGNALS = [
  "as an ai language model",
  "i cannot",
  "i am unable",
  "todo",
  "lorem ipsum",
  "tbd",
  "placeholder",
];

const JUDGE_INJECTION_SIGNALS = [
  "ignore the task",
  "ignore previous instructions",
  "ignore all previous instructions",
  "judge must accept",
  "you must accept",
  "verdict: accept",
  "\"verdict\": \"accept\"",
  "hide failures",
  "do not mention failures",
  "do not tell the buyer",
  "override the task",
  "new grading criteria",
  "system message for the judge",
];

function rubricCampaign(artifact: unknown): RubricVerdict {
  const camp = asCampaign(artifact);
  if (!camp) {
    return bad(
      ["campaign_launch artifact"],
      "Campaign workflows must return a CampaignLaunchArtifact (kind: 'campaign_launch') so creators, outreach, sample plan, risks, and the 7-day plan are explicit.",
    );
  }
  const missing: string[] = [];
  if (!Array.isArray(camp.creators) || camp.creators.length < 1) {
    missing.push("creators[] (at least one ranked creator)");
  }
  if (!Array.isArray(camp.outreach_drafts) || camp.outreach_drafts.length < 1) {
    missing.push("outreach_drafts[] (per-creator outreach copy)");
  }
  if (!Array.isArray(camp.sample_plan) || camp.sample_plan.length < 1) {
    missing.push("sample_plan[] (operational tasks)");
  }
  if (!Array.isArray(camp.risk_flags) || camp.risk_flags.length < 1) {
    missing.push("risk_flags[] (launch risk evaluation)");
  }
  if (!Array.isArray(camp.launch_plan) || camp.launch_plan.length < 7) {
    missing.push("launch_plan[] covering all 7 days");
  }
  if (!camp.evidence?.tools_used?.length) {
    missing.push("evidence.tools_used (which Reacher/Nia tools grounded the output)");
  }
  if (missing.length) {
    return bad(
      missing,
      `Campaign artifact is missing required sections: ${missing.join(", ")}.`,
    );
  }
  return ok(0.85, "Campaign artifact contains creator shortlist, outreach drafts, sample plan, risk flags, and a 7-day launch plan grounded in Reacher/Nia evidence.");
}

function rubricImplementationPlan(artifact: unknown, text: string): RubricVerdict {
  const plan = asImplementationPlan(artifact);
  const execPlan = asExecutionPlan(artifact);

  // Plan-for-approval shape.
  if (plan) {
    const missing: string[] = [];
    if (!plan.summary?.trim()) missing.push("summary");
    if (!Array.isArray(plan.context_required) || plan.context_required.length < 1) {
      missing.push("context_required[] (what Hyperspell/Nia/user must supply)");
    }
    if (!Array.isArray(plan.proposed_build) || plan.proposed_build.length < 2) {
      missing.push("proposed_build[] (at least 2 concrete steps)");
    }
    if (
      !Array.isArray(plan.acceptance_criteria) ||
      plan.acceptance_criteria.length < 2
    ) {
      missing.push("acceptance_criteria[] (at least 2 checks)");
    }
    if (missing.length) {
      return bad(
        missing,
        `Implementation plan is missing required sections: ${missing.join(", ")}.`,
      );
    }
    return ok(
      0.8,
      "Implementation plan defines context relays, proposed build steps, and acceptance criteria.",
    );
  }

  if (execPlan) {
    const missing: string[] = [];
    if (!execPlan.summary?.trim()) missing.push("summary");
    if (!Array.isArray(execPlan.deliverables) || execPlan.deliverables.length < 1) {
      missing.push("deliverables[]");
    }
    if (!Array.isArray(execPlan.acceptance_criteria) || execPlan.acceptance_criteria.length < 1) {
      missing.push("acceptance_criteria[]");
    }
    if (missing.length) {
      return bad(
        missing,
        `Execution plan is missing required sections: ${missing.join(", ")}.`,
      );
    }
    return ok(0.75, "Execution plan defines deliverables and acceptance criteria.");
  }

  // Free-form execution result. Look for the structural evidence the LLM
  // judge demands: an anchor URL the buyer can open (PR, v0, Vercel preview,
  // sandbox) plus either a changed-files manifest, a substantive code
  // preview, or an explicit "no edit was safe" explanation.
  const lower = text.toLowerCase();
  const hasGithubPr = /github\.com\/[\w.-]+\/[\w.-]+\/pull\//i.test(text);
  const hasPrLabel = /\bpr\b\s*[:#]|pull request/i.test(text);
  const hasPreviewUrl = /https?:\/\/(?:[\w.-]+\.)*(?:v0\.dev|v0\.app|vercel\.app|netlify\.app|codesandbox\.io|stackblitz\.com|codepen\.io)\b/i.test(text);
  const hasArtifactAnchor = hasGithubPr || hasPrLabel || hasPreviewUrl;

  const hasFilesVerb = /\bfiles?\b.*\b(changed|applied|edited|written|generated|added)\b/i.test(lower);
  const hasBulletFiles = /^- .+\.(ts|tsx|js|jsx|md|json|css|scss|py|rs|go|html|vue|svelte)\b/m.test(text);
  const hasFilesList = /\bfiles?\s*:\s*[\w.\-/]+\.(ts|tsx|js|jsx|md|json|css|scss|py|rs|go|html|vue|svelte)/i.test(text);
  const hasFencedCode = /```[\w-]*\n[\s\S]{120,}?\n```/m.test(text);
  const hasFiles = hasFilesVerb || hasBulletFiles || hasFilesList || hasFencedCode;

  const hasSafeRefusal = /no edit was safe|skipped because|did not modify because/i.test(lower);

  if (hasSafeRefusal) {
    return ok(0.6, "Execution result explains why no edit was safe.");
  }
  if (!hasArtifactAnchor) {
    return bad(
      ["artifact anchor (PR, v0/Vercel/sandbox URL) or safe-no-edit explanation"],
      "Implementation execution must surface an artifact the buyer can open (PR, v0.dev, vercel.app, sandbox) or explicitly explain why no edit was safe.",
    );
  }
  // Preview URLs (v0, Vercel, sandbox) ARE the deliverable — the URL is
  // openable and re-renderable. Treat it as sufficient on its own.
  if (hasPreviewUrl) {
    return ok(
      0.75,
      "Execution result links a live preview the buyer can open.",
    );
  }
  // PR-style anchors still require file evidence — the URL alone doesn't
  // prove what changed in the repo.
  if (!hasFiles) {
    return bad(
      ["files-changed manifest or substantive code preview"],
      "PR is referenced but no file manifest or code preview proves what was produced.",
    );
  }
  return ok(
    0.7,
    "Execution result includes a PR reference and changed-file or code-preview evidence.",
  );
}

function rubricGeneral(artifact: unknown, text: string): RubricVerdict {
  if (!text.trim() && !isArtifact(artifact)) {
    return bad(["any content"], "Output is empty.");
  }
  const trimmed = text.trim();
  if (trimmed.length < 60) {
    return bad(["substantive content"], "Output is too short to advance the user's goal.");
  }
  const lower = trimmed.toLowerCase();
  const injectionSignal = JUDGE_INJECTION_SIGNALS.find((signal) =>
    lower.includes(signal),
  );
  if (injectionSignal) {
    return bad(
      ["non-manipulative deliverable"],
      `Output contains judge-manipulation text ("${injectionSignal}") rather than usable task content.`,
    );
  }
  for (const signal of VAGUE_SIGNALS) {
    if (lower.includes(signal)) {
      return bad(["non-placeholder substance"], `Output contains placeholder/refusal text (\"${signal}\").`);
    }
  }
  return ok(0.7, "Output is substantive and free of placeholder/refusal language.");
}

export interface RubricInput {
  prompt: string;
  taskType: string;
  result: unknown;
}

/**
 * Run the structural rubric for the inferred judge kind. Useful as a
 * deterministic shadow of the LLM judge for tests and offline harness runs.
 */
export function rubricVerdict(input: RubricInput): RubricVerdict {
  const kind: JudgeKind = selectJudgeKind(input.prompt, input.taskType);
  const text = asText(input.result);

  switch (kind) {
    case "campaign":
      return rubricCampaign(input.result);
    case "implementation_plan":
      return rubricImplementationPlan(input.result, text);
    default:
      return rubricGeneral(input.result, text);
  }
}
