/**
 * M3 live end-to-end proof — reputation → routing, on the REAL backend.
 *
 *   npx tsx eval/router-bench/live-e2e.ts          # show current routing state
 *   npx tsx eval/router-bench/live-e2e.ts --judge  # also run the real judge + emit the record command
 *
 * Uses production components only:
 *   - live reputation read: convex `reputationDimensions.summaries`
 *   - real ranking blend:   lib/specialists/suggest.ts (reputation-weighted)
 *   - real judge:           the auction's JUDGE_GENERAL_PROMPT via lib/openai
 *
 * Flow to prove the loop:
 *   1) run with --judge → prints BEFORE routing for `stripe-payments`, runs the
 *      real judge on a Stripe deliverable, and prints the exact `convex run`
 *      command to record that outcome via the real recorder.
 *   2) run that command → writes a real reputation_dimensions row.
 *   3) run again (no flag) → AFTER: stripe-payments is now reputation-boosted.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";
import { suggestSpecialists, type ReputationMap } from "../../lib/specialists/suggest";
import { callOpenAIJSON } from "../../lib/openai";
import { api } from "../../convex/_generated/api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

const GOAL =
  process.env.ROUTER_GOAL ??
  "We run a creator marketplace and need to onboard sellers so they can receive payouts, split each sale between seller and platform, run subscription billing, and process refunds.";
const TARGET = process.env.ROUTER_TARGET ?? "stripe-payments";

// The auction's real judge prompt (convex/auctions.ts JUDGE_GENERAL_PROMPT).
const JUDGE_PROMPT = `You are an impartial judge for a general-purpose agent marketplace. The user described a goal in their own words; a specialist agent produced a deliverable. Decide whether the deliverable actually addresses the user's goal in a useful, specific, well-reasoned way. Output JSON only:
{ "verdict": "accept" | "reject", "reasoning": "<one paragraph>", "quality_score": <0.0-1.0> }`;

const STRIPE_DELIVERABLE = `Implemented Stripe Connect for the marketplace:
- Created Express connected accounts with hosted onboarding links for each seller (account_onboarding flow), capturing KYC and payout bank details.
- Configured destination charges with application_fee_amount so every sale is split between the seller's connected account and the platform automatically.
- Set up subscription billing via Prices + Subscriptions with a monthly plan and proration.
- Wired the /refunds endpoint to issue full/partial refunds and reverse the application fee.
- Added webhook handlers for account.updated, payment_intent.succeeded, and charge.refunded to keep payout and ledger state in sync.`;

async function loadEnvLocal(): Promise<void> {
  try {
    const raw = await readFile(join(REPO_ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw new Error(
      `Failed to load ${join(REPO_ROOT, ".env.local")}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const judgeMode = process.argv.includes("--judge");
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
  const c = new ConvexHttpClient(url);

  // 1) Live reputation map from REAL judged outcomes on the deployment.
  const rows = (await c.query(api.reputationDimensions.summaries, {})) as Array<{
    agent_id: string;
    tasks: number;
    overall: number;
  }>;
  const rep: ReputationMap = {};
  for (const r of rows) rep[r.agent_id] = { overall: r.overall, tasks: r.tasks };

  // 2) REAL ranking blend over the catalog pool (specs=[] folds in MCP_CATALOG).
  const res = await suggestSpecialists(GOAL, "general", [], 10, rep);
  const rank = res.suggestions.findIndex((s) => s.agent_id === TARGET);
  const t = res.suggestions[rank];

  // eslint-disable-next-line no-console
  console.log(`\n=== ROUTING STATE for goal → "${TARGET}" ===`);
  console.log(
    `top-5: ${res.suggestions
      .slice(0, 5)
      .map((s) => `${s.agent_id}(${(s.adjusted_score ?? s.fit_score).toFixed(3)})`)
      .join("  >  ")}`,
  );
  if (t) {
    console.log(
      `${TARGET}: rank=#${rank + 1}  base_fit=${t.base_fit_score?.toFixed(
        3,
      )}  adjusted=${t.adjusted_score?.toFixed(3)}  reputation=${
        t.reputation_overall != null
          ? `${t.reputation_overall.toFixed(3)} over ${t.reputation_tasks} task(s)`
          : "none (no judged outcomes yet)"
      }`,
    );
  } else {
    console.log(`${TARGET}: not in suggestions`);
  }

  // Quality from the REAL judge (--judge), or a default for reorder demos.
  let quality = 0.92;
  let accepted = true;
  if (judgeMode) {
    console.log(`\n=== REAL JUDGE (auction JUDGE_GENERAL_PROMPT) ===`);
    const verdict = await callOpenAIJSON<{
      verdict: string;
      reasoning: string;
      quality_score: number;
    }>({
      systemPrompt: JUDGE_PROMPT,
      userPrompt: `User goal:\n${GOAL}\n\nSpecialist deliverable:\n${STRIPE_DELIVERABLE}`,
      maxTokens: 400,
      timeoutMs: 25_000,
      retries: 1,
      purpose: "judge",
    });
    quality = Math.max(0, Math.min(1, Number(verdict.quality_score)));
    accepted = verdict.verdict === "accept";
    console.log(`verdict=${verdict.verdict}  quality_score=${quality.toFixed(3)}`);
    console.log(`reasoning: ${verdict.reasoning}`);
  }

  // Need a real tasks-row id for the FK. Reuse an existing one.
  const existing = (await c.query(api.reputationDimensions.forAgent, {
    agent_id: rows[0]?.agent_id ?? "codex-writer",
  })) as Array<{ task_id: string }>;
  const taskId = existing[0]?.task_id;

  console.log(`\n=== RECORD COMMAND (real recorder) for ${TARGET} ===`);
  if (!taskId) {
    console.log("no existing task_id found to attach the demo outcome to.");
    return;
  }
  const args = {
    agent_id: TARGET,
    task_id: taskId,
    actual_seconds: 22,
    estimated_seconds: 25,
    quality_score: quality,
    accepted,
    bid_price: 0.5,
    price_paid: 0.4,
  };
  console.log("Run this to write the real reputation row, then re-run to see AFTER:\n");
  console.log(
    `npx convex run reputationDimensions:_record '${JSON.stringify(args)}'`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
