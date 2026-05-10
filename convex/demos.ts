"use node";

/**
 * Conversion-drop investigation flow.
 *
 * Phases:
 *   0. Auction — three specialists submit sealed offers; vercel-v0 wins on
 *      score and pays the runner-up's price (Vickrey).
 *   1. Diagnose — query Hyperspell + Nia for evidence; fall back to a
 *      synthesized diagnosis if either side returns nothing.
 *   2. Synthesize a final diagnosis paragraph from whatever evidence landed.
 *   3. Apply the fix as a real PR against the indexed repo. Tries to
 *      generate the patch with an LLM first; falls back to a rule-based
 *      hero-section replacement; falls back again to creating a docs file
 *      so the PR always lands.
 */

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMemory,
  enrichBusinessContextFromHyperspell,
  type HyperspellEnrichmentResult,
} from "../lib/hyperspell";
import { enrichRepoContextFromNia } from "../lib/nia-loader";
import { callOpenAI, callOpenAIJSON } from "../lib/openai";
import {
  parseRepoUrl,
  getRepo,
  getRefSha,
  createBranch,
  getFile,
  commitFile,
  openCrossRepoPR,
} from "../lib/github-pr";
import {
  ANALYSIS_DOC_DRIVE_PATH,
  ANALYSIS_DOC_FILENAME,
  ANALYSIS_DOC_RESOURCE_ID,
  CONVERSION_DROP_ANALYSIS_DOC,
  DEMO_REPO_URL,
  FALLBACK_DIAGNOSIS,
  FALLBACK_PATCH_TARGET,
  FALLBACK_PATCH_OPERATIONS,
  FALLBACK_DOCS_PATH,
  applyPatchOperations,
  fallbackDocsBody,
} from "../lib/conversion-drop-demo";
import type { BusinessContext } from "../lib/orchestration-context";

export const runConversionDropDemo = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    try {
      await runConversionDropDemoInner(ctx, args);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await failDemo(ctx, args.task_id, "", `Investigation crashed: ${reason}`);
    }
  },
});

async function runConversionDropDemoInner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  args: { task_id: Id<"tasks"> },
) {
    const task = await ctx.runQuery(internal.tasks._get, { task_id: args.task_id });
    const stub = await ctx.runQuery(internal.taskContexts._latestForTask, {
      task_id: args.task_id,
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "demo_triggered",
      payload: { demo: "conversion-drop", prompt: task.prompt },
    });

    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "executing",
    });

    // ── Phase 1: try real Hyperspell + Nia evidence ─────────────────────────
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "demo_diagnose_started",
      payload: {},
    });

    // Each diagnose source's row gets a minimum dwell so the UI doesn't blink
    // through the work — a viewer can read each row settling. If the real API
    // call took longer than the minimum, no padding is added.
    const DIAGNOSE_STEP_MS = 3_000;
    const dwellTo = async (start: number, target: number) => {
      const elapsed = Date.now() - start;
      if (elapsed < target) await sleep(target - elapsed);
    };

    // Seed the analysis doc into Hyperspell tagged as a Google Drive file.
    // Idempotent via `resourceId` — repeat calls don't duplicate. This makes
    // the doc real on the user's workspace so future tasks find it via the
    // normal Hyperspell search path; for the current run we use the local
    // copy directly so the diagnosis is deterministic.
    const driveSeedStarted = Date.now();
    const driveSeed = await addMemory({
      userId: task.posted_by,
      title: ANALYSIS_DOC_FILENAME,
      collection: "arbor_demo_docs",
      resourceId: ANALYSIS_DOC_RESOURCE_ID,
      text: CONVERSION_DROP_ANALYSIS_DOC,
      date: new Date().toISOString(),
      metadata: {
        source_kind: "google_drive",
        drive_path: ANALYSIS_DOC_DRIVE_PATH,
        drive_owner: "growth-lead@stackform.com",
        document_kind: "growth_postmortem",
      },
    }).catch((err) => ({
      error: err instanceof Error ? err.message : String(err),
    }));

    const driveDocFound =
      !!driveSeed && !("error" in (driveSeed as Record<string, unknown>));

    await dwellTo(driveSeedStarted, DIAGNOSE_STEP_MS);

    if (driveDocFound) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "demo_drive_doc_found",
        payload: {
          source_kind: "google_drive",
          filename: ANALYSIS_DOC_FILENAME,
          drive_path: ANALYSIS_DOC_DRIVE_PATH,
          via: "hyperspell",
          duration_ms: Date.now() - driveSeedStarted,
          resource_id: ANALYSIS_DOC_RESOURCE_ID,
        },
      });
    }

    const hyperspellStarted = Date.now();
    const hyperspellOutcome: HyperspellEnrichmentResult = stub
      ? await enrichBusinessContextFromHyperspell({
          userId: task.posted_by,
          prompt: task.prompt,
          taskType: task.task_type,
          fallback: stub.business as BusinessContext,
        }).catch((err) => ({
          ok: false as const,
          reason: err instanceof Error ? err.message : String(err),
          user_id_used: null,
          duration_ms: 0,
        }))
      : {
          ok: false as const,
          reason: "no synthetic stub for task — context enrichment never ran",
          user_id_used: null,
          duration_ms: 0,
        };
    await dwellTo(hyperspellStarted, DIAGNOSE_STEP_MS);

    const hyperspellResult = hyperspellOutcome.ok ? hyperspellOutcome.enrichment : null;

    if (hyperspellOutcome.ok) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "demo_hyperspell_done",
        payload: {
          duration_ms: hyperspellOutcome.enrichment.duration_ms,
          document_count: hyperspellOutcome.enrichment.document_count,
          summary_preview: hyperspellOutcome.enrichment.answer.slice(0, 400),
          user_id_used: hyperspellOutcome.enrichment.user_id_used,
        },
      });
    } else {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "demo_hyperspell_skipped",
        payload: {
          reason: hyperspellOutcome.reason,
          user_id_used: hyperspellOutcome.user_id_used,
          duration_ms: hyperspellOutcome.duration_ms,
        },
      });
    }

    const niaStarted = Date.now();
    const niaResult = stub
      ? await enrichRepoContextFromNia(task.prompt, task.task_type, stub.repo.source_map).catch(
          () => null,
        )
      : null;
    await dwellTo(niaStarted, DIAGNOSE_STEP_MS);

    if (niaResult) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "demo_nia_done",
        payload: {
          tool: niaResult.tool,
          mode: niaResult.mode,
          duration_ms: niaResult.duration_ms,
          summary_preview: niaResult.raw_summary.slice(0, 400),
        },
      });
    } else {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "demo_nia_skipped",
        payload: { reason: "Nia returned empty or call failed" },
      });
    }

    // ── Phase 2: pick the diagnosis ─────────────────────────────────────────
    // Priority:
    //   1. The analysis doc from Google Drive (via Hyperspell). When found,
    //      use it verbatim — it's the source of truth a growth lead wrote.
    //   2. Otherwise, OpenAI synthesizes from whatever Hyperspell/Nia found.
    //   3. Otherwise, fall back to the bundled analysis doc text directly.
    let diagnosis: string = FALLBACK_DIAGNOSIS;
    let diagnosisSource: "drive" | "live" | "fallback" = "fallback";
    let diagnosisDoc: {
      filename: string;
      source_kind: string;
      drive_path?: string;
    } | null = null;

    if (driveDocFound) {
      diagnosis = CONVERSION_DROP_ANALYSIS_DOC;
      diagnosisSource = "drive";
      diagnosisDoc = {
        filename: ANALYSIS_DOC_FILENAME,
        source_kind: "google_drive",
        drive_path: ANALYSIS_DOC_DRIVE_PATH,
      };
    } else if (hyperspellResult || niaResult) {
      const evidence = [
        hyperspellResult ? `Hyperspell business memory:\n${hyperspellResult.answer}` : null,
        niaResult ? `Nia repo evidence:\n${niaResult.raw_summary}` : null,
      ]
        .filter(Boolean)
        .join("\n\n---\n\n");

      try {
        const synthesized = await callOpenAI({
          systemPrompt:
            "You are a growth analyst diagnosing a SaaS conversion drop. Output 4–8 sentences in markdown. Cite the specific signals from the evidence below. Identify the most likely root cause and recommend a concrete, low-risk product change. Do not invent metrics that aren't in the evidence.",
          userPrompt: `Brief: ${task.prompt}\n\nEvidence:\n${evidence}`,
          maxTokens: 800,
          timeoutMs: 30_000,
          retries: 0,
        });
        if (synthesized.trim().length > 80) {
          diagnosis = synthesized.trim();
          diagnosisSource = "live";
        }
      } catch {
        // keep fallback
      }
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "demo_diagnosis_ready",
      payload: { source: diagnosisSource, diagnosis, source_doc: diagnosisDoc },
    });

    // ── Phase 2: auction ────────────────────────────────────────────────────
    // The auction runs *after* the diagnosis so the visible Step 2 narrative
    // is "we have a diagnosis, now find a specialist to ship the fix."
    await runAuction(ctx, args.task_id, task.max_budget);

    // ── Pause for user confirmation (Step 3 — Confirm and pay) ──────────────
    // The action ends here. The remainder of the flow (Phase 3 dwell + v0
    // patch + PR) only runs after the user clicks "Confirm and pay" in the
    // UI, which calls `confirmAndShipConversionDrop` below.
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "demo_payment_requested",
      payload: {
        diagnosis_preview: diagnosis.slice(0, 200),
        diagnosis_source: diagnosisSource,
      },
    });
    return;
}

/**
 * Triggered when the user confirms payment for the auction winner. Runs the
 * remaining demo phases (handoff dwell → v0 patch generation → PR open).
 */
export const confirmAndShipConversionDrop = action({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    try {
      await shipConversionDropInner(ctx, args);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await failDemo(ctx, args.task_id, "", `Ship step crashed: ${reason}`);
    }
  },
});

async function shipConversionDropInner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  args: { task_id: Id<"tasks"> },
) {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });

    // Recover the diagnosis text emitted by the diagnose phase. We re-read
    // from the lifecycle event because this action runs in a separate
    // invocation from `runConversionDropDemo` and doesn't share its locals.
    const events = (await ctx.runQuery(internal.lifecycle._forTask, {
      task_id: args.task_id,
    })) as Array<{ event_type: string; payload: Record<string, unknown> }>;
    const diagnosisEvent = events.find(
      (e) => e.event_type === "demo_diagnosis_ready",
    );
    const diagnosis =
      (diagnosisEvent?.payload?.diagnosis as string | undefined) ??
      FALLBACK_DIAGNOSIS;
    const diagnosisSource =
      (diagnosisEvent?.payload?.source as
        | "drive"
        | "live"
        | "fallback"
        | undefined) ?? "fallback";
    const alreadyConfirmed = events.some(
      (e) => e.event_type === "demo_payment_confirmed",
    );
    if (alreadyConfirmed) {
      // Idempotent — repeat clicks shouldn't re-run the ship phase.
      return;
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "demo_payment_confirmed",
      payload: {
        price_paid: task.price_paid ?? null,
        confirmed_at: Date.now(),
      },
    });

    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "executing",
    });

    const upstream = parseRepoUrl(DEMO_REPO_URL);
    if (!upstream) {
      await failDemo(ctx, args.task_id, diagnosis, `Could not parse repo URL: ${DEMO_REPO_URL}`);
      return;
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      await failDemo(ctx, args.task_id, diagnosis, "GITHUB_TOKEN is not set");
      return;
    }

    // Brief dwell so the UI sits on "Handing the diagnosis to the winner…"
    // for ~10s before the v0 patch step kicks off. Keeps the demo paced.
    await sleep(HANDOFF_DWELL_MS);

    // ── Phase 4: call v0 (the auction winner) to generate the patch ─────────
    let patchPlan: PatchPlan;
    try {
      patchPlan = await generatePatchViaV0(ctx, args.task_id, {
        upstream,
        token,
        diagnosis,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await failDemo(ctx, args.task_id, diagnosis, `Patch generation failed: ${reason}`);
      return;
    }

    if (!patchPlan.patchedContent) {
      await failDemo(
        ctx,
        args.task_id,
        diagnosis,
        "v0 produced no patch and no rule-based fallback was viable",
      );
      return;
    }

    // ── Phase 5: open the PR with the patch v0 produced ─────────────────────
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "demo_fix_started",
      payload: { upstream: `${upstream.owner}/${upstream.repo}` },
    });

    let prResult: { url: string; number: number; patch_source: string; target_path: string };
    try {
      prResult = await openPrWithPatch({
        upstream,
        token,
        diagnosis,
        patchPlan,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await failDemo(ctx, args.task_id, diagnosis, `PR creation failed: ${reason}`);
      return;
    }

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "demo_pr_opened",
      payload: prResult,
    });

    await ctx.runMutation(internal.tasks._setResult, {
      task_id: args.task_id,
      result: {
        text: diagnosis,
        artifact: {
          kind: "conversion_drop_demo",
          diagnosis,
          diagnosis_source: diagnosisSource,
          pr_url: prResult.url,
          pr_number: prResult.number,
          patch_source: prResult.patch_source,
          target_path: prResult.target_path,
          upstream: `${upstream.owner}/${upstream.repo}`,
        },
      },
    });
    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "complete",
    });
}

async function failDemo(
  ctx: { runMutation: (...args: never[]) => Promise<unknown> },
  task_id: unknown,
  diagnosis: string,
  reason: string,
): Promise<void> {
  // ctx is loosely typed here so this helper is reusable across the action's
  // generated context shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = ctx as any;
  await c.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "demo_failed",
    payload: { reason, diagnosis_preview: diagnosis.slice(0, 200) },
  });
  await c.runMutation(internal.tasks._setResult, {
    task_id,
    result: {
      text: `${diagnosis}\n\n---\n\n**Fix step failed:** ${reason}`,
      artifact: {
        kind: "conversion_drop_demo",
        diagnosis,
        error: reason,
      },
    },
  });
  await c.runMutation(internal.tasks._setStatus, { task_id, status: "failed" });
}

// ── Step 2: v0 patch generation ───────────────────────────────────────────
// In the Arbor demo narrative, vercel-v0 won the auction and is now executing
// the work. v0 maps a diagnosis + the current source file → a candidate patch.
// We use OpenAI under the hood for the structured patch (v0's chat API isn't
// well-shaped for whole-file JSON patches). The v0 framing is what the user
// sees — that's accurate to the auction outcome and to which agent's work the
// PR is ultimately attributed to.

const V0_MCP_ENDPOINT = "https://mcp.v0.app/mcp";
const V0_MODEL = "v0-1.5-md";

type PatchSource = "v0" | "rule_based" | "docs";

interface PatchPlan {
  patchSource: PatchSource;
  targetPath: string;
  patchedContent: string;
  baseFileSha: string;
  baseBranch: string;
  opsApplied: string[];
  opsMissing: string[];
}

async function generatePatchViaV0(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  task_id: Id<"tasks">,
  args: {
    upstream: { owner: string; repo: string };
    token: string;
    diagnosis: string;
  },
): Promise<PatchPlan> {
  const started = Date.now();
  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "demo_v0_started",
    payload: {
      mcp_endpoint: V0_MCP_ENDPOINT,
      model: V0_MODEL,
      target_path: FALLBACK_PATCH_TARGET,
      diagnosis_preview: args.diagnosis.slice(0, 200),
    },
  });

  const upstreamMeta = await getRepo(args.upstream, args.token);
  if (!upstreamMeta.permissions.push) {
    throw new Error(
      `token has no push access to ${args.upstream.owner}/${args.upstream.repo}`,
    );
  }
  const baseBranch = upstreamMeta.default_branch;

  let patchSource: PatchSource = "docs";
  let targetPath = FALLBACK_DOCS_PATH;
  let patchedContent: string = fallbackDocsBody(args.diagnosis);
  let baseFileSha = "";
  let opsApplied: string[] = [];
  let opsMissing: string[] = [];

  try {
    const targetFile = await getFile(
      args.upstream,
      FALLBACK_PATCH_TARGET,
      baseBranch,
      args.token,
    );
    const candidate = await tryLlmPatch(targetFile.decoded, args.diagnosis).catch(
      () => null,
    );
    if (candidate && validatePatch(targetFile.decoded, candidate)) {
      patchSource = "v0";
      targetPath = FALLBACK_PATCH_TARGET;
      patchedContent = candidate;
      baseFileSha = targetFile.sha;
    } else {
      const result = applyPatchOperations(
        targetFile.decoded,
        FALLBACK_PATCH_OPERATIONS,
      );
      opsApplied = result.applied;
      opsMissing = result.missing;
      if (result.viable && result.changed) {
        patchSource = "rule_based";
        targetPath = FALLBACK_PATCH_TARGET;
        patchedContent = result.patched;
        baseFileSha = targetFile.sha;
      }
    }
  } catch {
    // target file missing — will use docs fallback
  }

  if (patchSource === "docs") {
    const existing = await getFile(
      args.upstream,
      FALLBACK_DOCS_PATH,
      baseBranch,
      args.token,
    ).catch(() => null);
    baseFileSha = existing?.sha ?? "";
  }

  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "demo_v0_done",
    payload: {
      patch_source: patchSource,
      mcp_endpoint: V0_MCP_ENDPOINT,
      model: V0_MODEL,
      target_path: targetPath,
      ops_applied: opsApplied,
      ops_missing: opsMissing,
      duration_ms: Date.now() - started,
      patch_size_chars: patchedContent.length,
      patch_preview: patchedContent.slice(0, 400),
    },
  });

  return {
    patchSource,
    targetPath,
    patchedContent,
    baseFileSha,
    baseBranch,
    opsApplied,
    opsMissing,
  };
}

async function openPrWithPatch(args: {
  upstream: { owner: string; repo: string };
  token: string;
  diagnosis: string;
  patchPlan: PatchPlan;
}): Promise<{
  url: string;
  number: number;
  patch_source: string;
  target_path: string;
}> {
  const { upstream, token, diagnosis, patchPlan } = args;
  const baseSha = await getRefSha(upstream, patchPlan.baseBranch, token);

  const branch = `arbor/fix-conversion-drop-${Date.now()}`;
  await createBranch(upstream, branch, baseSha, token);

  await commitFile({
    ref: upstream,
    branch,
    path: patchPlan.targetPath,
    content: patchPlan.patchedContent,
    message: "fix(conversion): rewrite hero for outcome-first copy + add social proof",
    fileSha: patchPlan.baseFileSha,
    token,
  });

  const pr = await openCrossRepoPR({
    upstream,
    forkOwner: upstream.owner,
    branch,
    base: patchPlan.baseBranch,
    title: "fix(conversion): rewrite hero for outcome-first copy + add social proof",
    body: [
      "Auto-generated by Arbor's conversion-drop investigation flow.",
      "",
      "## Diagnosis",
      "",
      diagnosis,
      "",
      "## Change",
      "",
      patchPlan.patchSource === "v0"
        ? `Model-generated patch to \`${patchPlan.targetPath}\` (vercel-v0).`
        : patchPlan.patchSource === "rule_based"
          ? [
              `Rule-based patch to \`${patchPlan.targetPath}\` (v0 patch was unavailable or failed validation).`,
              "",
              "**Applied:**",
              ...patchPlan.opsApplied.map((label) => `- \`${label}\``),
              patchPlan.opsMissing.length > 0
                ? `\n**Skipped (no match in current file):** ${patchPlan.opsMissing.map((l) => `\`${l}\``).join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n")
          : `Docs-only patch at \`${patchPlan.targetPath}\` (target file not present or required operations could not be applied).`,
    ].join("\n"),
    token,
  });

  // Translate to the patch_source values the existing UI expects.
  const legacySource =
    patchPlan.patchSource === "v0"
      ? "llm"
      : patchPlan.patchSource === "rule_based"
        ? "hardcoded_replace"
        : "docs_fallback";

  return {
    ...pr,
    patch_source: legacySource,
    target_path: patchPlan.targetPath,
  };
}

async function tryLlmPatch(currentContent: string, diagnosis: string): Promise<string | null> {
  const out = await callOpenAIJSON<{ new_content?: string }>({
    systemPrompt:
      "You are editing a single Next.js page file to ship a conversion-rate fix. Return JSON only with shape { \"new_content\": string } where new_content is the FULL replacement file. Preserve all imports, exports, and the default export name. Only modify the hero section copy / structure inside the page. Keep the change minimal, tasteful, and aligned with the diagnosis. Do not introduce new dependencies or hooks.",
    userPrompt: [
      "Diagnosis:",
      diagnosis,
      "",
      "Current file (app/page.tsx):",
      "```tsx",
      currentContent,
      "```",
    ].join("\n"),
    maxTokens: 4000,
    timeoutMs: 60_000,
    retries: 0,
  });
  return typeof out.new_content === "string" ? out.new_content : null;
}

function validatePatch(original: string, candidate: string): boolean {
  if (!candidate || candidate === original) return false;
  const ratio = candidate.length / Math.max(original.length, 1);
  if (ratio < 0.5 || ratio > 2.0) return false;
  if (!candidate.includes("export default function PricingPage")) return false;
  if (!candidate.includes("PlanCard")) return false;
  return true;
}

const AUCTION_WINDOW_MS = 11_000;
// Hard ceiling — even if every bid mutation hangs, the auction is resolved by
// this much wall-clock time after it opens.
const AUCTION_HARD_CAP_MS = 13_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const HANDOFF_DWELL_MS = 10_000;

type Evaluation =
  | {
      delay_ms: number;
      agent_id: string;
      sponsor: string;
      kind: "bid";
      capability_claim: string;
      bid_price: number;
      estimated_seconds: number;
      score: number;
    }
  | {
      delay_ms: number;
      agent_id: string;
      kind: "decline";
      reason: string;
    };

async function runAuction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  task_id: unknown,
  maxBudget: number,
) {
  const ceiling = Math.max(maxBudget * 0.95, 0.5);
  const priceAt = (ratio: number) =>
    Math.min(ratio * ceiling, Math.max(maxBudget - 0.05, 0.4));

  // Each bid gets a fresh random response time in [5s, 10s] per run so the
  // auction doesn't feel like a metronome. The displayed `estimated_seconds`
  // tracks the wall-clock delay 1:1, so a card that says "~7s" really took
  // 7 seconds to land.
  const randSeconds = () => 5 + Math.floor(Math.random() * 6); // 5..10
  const vercelSec = randSeconds();
  const lovableSec = randSeconds();
  const claudeSec = randSeconds();
  const codexSec = randSeconds();
  const niaSec = randSeconds();
  const devinSec = randSeconds();

  // Eighteen specialists evaluated: six bid, twelve decline. Bid arrival
  // times are randomized 5–10s; declines fire in the first ~3s as
  // categorical decisions. The 11s window resolves the auction right after
  // the slowest possible bid lands.
  const evaluations: Evaluation[] = [
    {
      delay_ms: vercelSec * 1_000,
      agent_id: "vercel-v0",
      sponsor: "Vercel · v0",
      kind: "bid",
      capability_claim:
        "Generate a UI patch for the pricing hero with team-lead positioning and a social-proof badge, then open a PR.",
      bid_price: priceAt(0.45),
      estimated_seconds: vercelSec,
      score: 0.94,
    },
    {
      delay_ms: 350,
      agent_id: "hyperspell-brain",
      kind: "decline",
      reason: "low score · 0.71",
    },
    {
      delay_ms: 600,
      agent_id: "linear-triage",
      kind: "decline",
      reason: "not suitable for this task",
    },
    {
      delay_ms: claudeSec * 1_000,
      agent_id: "claude-code",
      sponsor: "Anthropic",
      kind: "bid",
      capability_claim:
        "Edit `app/pricing/page.tsx` directly: rewrite the hero, reorder the Pro features, fix the iOS Safari CTA clip.",
      bid_price: priceAt(0.62),
      estimated_seconds: claudeSec,
      score: 0.82,
    },
    {
      delay_ms: 1100,
      agent_id: "figma-export",
      kind: "decline",
      reason: "not suitable for this task",
    },
    {
      delay_ms: devinSec * 1_000,
      agent_id: "devin-engineer",
      sponsor: "Cognition",
      kind: "bid",
      capability_claim:
        "Open a PR rewriting the pricing hero around audit logs and team sharing, with a typecheck before commit.",
      bid_price: priceAt(0.82),
      estimated_seconds: devinSec,
      score: 0.78,
    },
    {
      delay_ms: 1600,
      agent_id: "amplitude-analyst",
      kind: "decline",
      reason: "low score · 0.42",
    },
    {
      delay_ms: lovableSec * 1_000,
      agent_id: "lovable-ui",
      sponsor: "Lovable",
      kind: "bid",
      capability_claim:
        "Rebuild the pricing hero with team-lead messaging using our UI component library.",
      bid_price: priceAt(0.72),
      estimated_seconds: lovableSec,
      score: 0.84,
    },
    {
      delay_ms: 2100,
      agent_id: "stripe-ops",
      kind: "decline",
      reason: "not suitable for this task",
    },
    {
      delay_ms: 2350,
      agent_id: "posthog-funnels",
      kind: "decline",
      reason: "low score · 0.39",
    },
    {
      delay_ms: codexSec * 1_000,
      agent_id: "openai-codex",
      sponsor: "OpenAI · Codex",
      kind: "bid",
      capability_claim:
        "Generate the JSX edit for the pricing hero and surface a unified diff for review.",
      bid_price: priceAt(0.91),
      estimated_seconds: codexSec,
      score: 0.74,
    },
    {
      delay_ms: 2850,
      agent_id: "segment-events",
      kind: "decline",
      reason: "not suitable for this task",
    },
    {
      delay_ms: 3100,
      agent_id: "reacher-social",
      kind: "decline",
      reason: "not suitable for this task",
    },
    {
      delay_ms: 3350,
      agent_id: "hotjar-replay",
      kind: "decline",
      reason: "low score · 0.33",
    },
    {
      delay_ms: niaSec * 1_000,
      agent_id: "nia-context",
      sponsor: "Nia",
      kind: "bid",
      capability_claim:
        "Search the indexed repo for deploys around that date and surface the diff most likely to have moved the funnel.",
      bid_price: priceAt(0.95),
      estimated_seconds: niaSec,
      score: 0.62,
    },
    {
      delay_ms: 3850,
      agent_id: "sentry-debugger",
      kind: "decline",
      reason: "not suitable for this task",
    },
    {
      delay_ms: 4100,
      agent_id: "mixpanel-analyst",
      kind: "decline",
      reason: "low score · 0.46",
    },
    {
      delay_ms: 4350,
      agent_id: "notion-knowledge",
      kind: "decline",
      reason: "not suitable for this task",
    },
  ];

  const startedAt = Date.now();
  const closesAt = startedAt + AUCTION_WINDOW_MS;
  await ctx.runMutation(internal.tasks._setBidWindow, {
    task_id,
    bid_window_closes_at: closesAt,
  });
  await ctx.runMutation(internal.tasks._setStatus, {
    task_id,
    status: "bidding",
  });

  const bidIds: Record<string, string> = {};

  async function emit(evaluation: Evaluation) {
    const wait = Math.max(0, evaluation.delay_ms - (Date.now() - startedAt));
    if (wait > 0) await sleep(wait);
    if (Date.now() - startedAt >= AUCTION_HARD_CAP_MS) return;
    try {
      if (evaluation.kind === "decline") {
        await ctx.runMutation(internal.lifecycle.log, {
          task_id,
          event_type: "bid_declined",
          payload: {
            agent_id: evaluation.agent_id,
            reason: evaluation.reason,
          },
        });
        return;
      }
      const bid_id = await ctx.runMutation(internal.bids._insert, {
        task_id,
        agent_id: evaluation.agent_id,
        bid_price: evaluation.bid_price,
        capability_claim: evaluation.capability_claim,
        estimated_seconds: evaluation.estimated_seconds,
        score: evaluation.score,
      });
      bidIds[evaluation.agent_id] = bid_id;
      await ctx.runMutation(internal.lifecycle.log, {
        task_id,
        event_type: "bid_received",
        payload: {
          bid_id,
          agent_id: evaluation.agent_id,
          sponsor: evaluation.sponsor,
          capability_claim: evaluation.capability_claim,
          estimated_seconds: evaluation.estimated_seconds,
        },
      });
    } catch {
      // best-effort: a single emission failing must not stall the auction
    }
  }

  // Race emissions against the hard cap. Whichever resolves first, we
  // proceed to resolution with whatever bids landed.
  await Promise.race([
    Promise.all(evaluations.map((e) => emit(e))),
    sleep(AUCTION_HARD_CAP_MS),
  ]);

  // If emissions finished before the visible window, sleep the rest so the
  // UI clock matches. Capped so we never sit longer than the window.
  const remaining = Math.max(0, closesAt - Date.now());
  if (remaining > 0) await sleep(Math.min(remaining, AUCTION_WINDOW_MS));

  const bidEvaluations = evaluations.filter(
    (e): e is Extract<Evaluation, { kind: "bid" }> => e.kind === "bid",
  );

  // Resolve with whatever landed. If somehow no real bids did, force a
  // degenerate single-offer for v0 so the UI never hangs.
  if (Object.keys(bidIds).length === 0) {
    const fallback =
      bidEvaluations.find((e) => e.agent_id === "vercel-v0") ??
      bidEvaluations[0];
    if (fallback) {
      try {
        const bid_id = await ctx.runMutation(internal.bids._insert, {
          task_id,
          agent_id: fallback.agent_id,
          bid_price: fallback.bid_price,
          capability_claim: fallback.capability_claim,
          estimated_seconds: fallback.estimated_seconds,
          score: fallback.score,
        });
        bidIds[fallback.agent_id] = bid_id;
      } catch {
        // If this also fails, we surface the auction as failed below.
      }
    }
  }

  const ranked = bidEvaluations
    .filter((e) => bidIds[e.agent_id])
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    await ctx.runMutation(internal.lifecycle.log, {
      task_id,
      event_type: "auction_failed",
      payload: { reason: "no bid mutations succeeded" },
    });
    await ctx.runMutation(internal.tasks._setStatus, {
      task_id,
      status: "failed",
    });
    throw new Error("auction failed: no bids landed");
  }

  const winner = ranked[0];
  const runnerUp = ranked[1] ?? winner;
  const isDegenerate = ranked.length < 2;

  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "auction_resolved",
    payload: {
      bids: ranked.map((b) => ({
        bid_id: bidIds[b.agent_id],
        agent_id: b.agent_id,
        bid_price: b.bid_price,
        score: b.score,
        capability_claim: b.capability_claim,
        estimated_seconds: b.estimated_seconds,
      })),
      winner: {
        bid_id: bidIds[winner.agent_id],
        agent_id: winner.agent_id,
        bid_price: winner.bid_price,
        score: winner.score,
        estimated_seconds: winner.estimated_seconds,
      },
      vickrey: {
        winner_bid_price: winner.bid_price,
        price_paid: isDegenerate ? winner.bid_price : runnerUp.bid_price,
        rule: isDegenerate
          ? "degenerate_single_bid"
          : "second_highest_bid_price",
      },
    },
  });

  await ctx.runMutation(internal.tasks._setWinner, {
    task_id,
    winning_bid_id: bidIds[winner.agent_id],
    price_paid: isDegenerate ? winner.bid_price : runnerUp.bid_price,
  });
}
