/**
 * Router benchmark orchestrator.
 *
 *   npx tsx eval/router-bench/run.ts
 *
 * Runs every selection strategy over TWO suites and scores selection accuracy:
 *   - EASY: 10 disjoint-domain real MCP servers (sanity floor; saturates fast).
 *   - HARD: catalog + near-duplicate distractors, constraint-specific goals
 *     where only one of several similar tools fits. The gap between the LLM
 *     router and the embedding/lexical baselines on HARD is the real evidence of
 *     routing IP — that's the number the council cares about.
 *
 * random / lexical / embedding run offline with zero secrets. The `llm` strategy
 * (the real shipped router) runs automatically when OPENAI_API_KEY is available;
 * the script reads it from .env.local if not already in the environment. Secrets
 * are never printed.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ROUTER_TASKS, type RouterTask } from "./tasks";
import { HARD_TASKS } from "./tasks-hard";
import { ALL_STRATEGIES, POOL } from "./strategies";
import { EXTRA_SPECIALISTS } from "./distractors";
import type { CatalogEntry } from "../../lib/specialists/catalog";
import {
  aggregate,
  pct,
  scoreTask,
  type StrategyScore,
  type TaskScore,
} from "./score";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const RESULTS_DIR = join(__dirname, "results");

const HARD_POOL: CatalogEntry[] = [...POOL, ...EXTRA_SPECIALISTS];

interface Suite {
  label: string;
  pool: CatalogEntry[];
  tasks: RouterTask[];
  scores: StrategyScore[];
}

/** Load KEY=VALUE pairs from .env.local into process.env (no overwrite). */
async function loadEnvLocal(): Promise<void> {
  try {
    const raw = await readFile(join(REPO_ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // no .env.local — fine, offline strategies still run.
      return;
    }
    throw new Error(
      `Failed to load ${join(REPO_ROOT, ".env.local")}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function runStrategy(
  name: string,
  requiresOpenAI: boolean,
  tasks: RouterTask[],
  rank: (goal: string) => Promise<string[]>,
): Promise<StrategyScore> {
  if (requiresOpenAI && !process.env.OPENAI_API_KEY) {
    return aggregate(name, [], {
      ran: false,
      note: "skipped — OPENAI_API_KEY not set (add it to .env.local to score the real router)",
    });
  }
  const taskScores: TaskScore[] = [];
  for (const task of tasks) {
    try {
      const ranked = await rank(task.goal);
      taskScores.push(scoreTask(task, ranked));
    } catch (err) {
      return aggregate(name, taskScores, {
        ran: false,
        note: `errored on task ${task.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  }
  return aggregate(name, taskScores);
}

async function runSuite(
  label: string,
  pool: CatalogEntry[],
  tasks: RouterTask[],
): Promise<Suite> {
  const scores: StrategyScore[] = [];
  for (const strat of ALL_STRATEGIES) {
    process.stderr.write(`▶ [${label}] ${strat.name}…\n`);
    scores.push(
      await runStrategy(strat.name, !!strat.requiresOpenAI, tasks, (goal) =>
        strat.rank(goal, pool),
      ),
    );
  }
  return { label, pool, tasks, scores };
}

function renderHeadline(suite: Suite): string {
  const lines: string[] = [];
  lines.push(
    `### ${suite.label}  ·  pool ${suite.pool.length} · tasks ${suite.tasks.length}\n`,
  );
  lines.push("| Strategy | acc@1 | acc@3 | MRR | acc@1 (adversarial) |");
  lines.push("|---|---|---|---|---|");
  for (const s of suite.scores) {
    if (!s.ran) {
      lines.push(`| \`${s.strategy}\` | — | — | — | _${s.note}_ |`);
      continue;
    }
    lines.push(
      `| \`${s.strategy}\` | ${pct(s.acc1)} | ${pct(s.acc3)} | ${s.mrr.toFixed(
        3,
      )} | ${pct(s.acc1_adversarial)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderVerdict(hard: Suite): string {
  const llm = hard.scores.find((s) => s.strategy === "llm");
  const emb = hard.scores.find((s) => s.strategy === "embedding");
  const lex = hard.scores.find((s) => s.strategy === "lexical");
  const lines: string[] = ["## Verdict (HARD suite)\n"];
  if (llm?.ran && emb?.ran && lex?.ran) {
    const best = Math.max(emb.acc1, lex.acc1);
    const delta = llm.acc1 - best;
    const bestName = emb.acc1 >= lex.acc1 ? "embedding" : "lexical";
    if (delta > 0.1) {
      lines.push(
        `On hard, near-duplicate selection the LLM router beats the best baseline (\`${bestName}\`, ${pct(
          best,
        )}) by **${pct(
          delta,
        )}** acc@1. That is real routing signal: it reasons about the constraint, not just the domain keyword. Worth building the moat on (M2/M3).`,
      );
    } else if (delta < -0.05) {
      lines.push(
        `⚠️ On hard selection the LLM router is **${pct(
          -delta,
        )} worse** than \`${bestName}\` (${pct(
          best,
        )}). Today's router is NOT differentiated IP — exactly the council's warning. The effectiveness signal (M3 reputation) must do the work, not the prompt.`,
      );
    } else {
      lines.push(
        `⚠️ On hard selection the LLM router (${pct(
          llm.acc1,
        )}) is within ±10% of the best baseline \`${bestName}\` (${pct(
          best,
        )}) — Δ ${pct(
          delta,
        )}. Marginal. A single-LLM-rank is not yet a moat; M3 reputation from real outcomes is what should create durable separation.`,
      );
    }
  } else {
    lines.push(
      "_LLM router not scored (no OPENAI_API_KEY). Offline baselines establish the floor; add the key to .env.local and re-run for the headline comparison._",
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderMarkdown(easy: Suite, hard: Suite): string {
  const lines: string[] = [];
  lines.push("# Router Benchmark — Scorecard\n");
  lines.push(
    "Strategies: `random` (floor) · `lexical` (keyword) · `embedding` (local vector search) · `llm` (the real shipped router, lib/specialists/suggest.ts).\n",
  );
  lines.push("## Headline\n");
  lines.push(renderHeadline(easy));
  lines.push(renderHeadline(hard));
  lines.push(renderVerdict(hard));

  // Per-domain acc@1 on HARD (where it matters).
  const ran = hard.scores.filter((s) => s.ran);
  const domains = Array.from(new Set(hard.tasks.map((t) => t.domain)));
  if (ran.length) {
    lines.push("## HARD acc@1 by domain\n");
    lines.push(`| domain | ${ran.map((s) => s.strategy).join(" | ")} |`);
    lines.push(`|---|${ran.map(() => "---").join("|")}|`);
    for (const d of domains) {
      const cells = ran.map((s) =>
        d in s.perDomainAcc1 ? pct(s.perDomainAcc1[d]) : "—",
      );
      lines.push(`| ${d} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const easy = await runSuite("EASY (disjoint domains)", POOL, ROUTER_TASKS);
  const hard = await runSuite("HARD (near-duplicates)", HARD_POOL, HARD_TASKS);

  const md = renderMarkdown(easy, hard);
  // eslint-disable-next-line no-console
  console.log("\n" + md);

  await mkdir(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(
    join(RESULTS_DIR, `router-bench-${ts}.json`),
    JSON.stringify({ generatedAt: ts, easy, hard }, null, 2),
  );
  await writeFile(join(RESULTS_DIR, `router-bench-${ts}.md`), md);
  await writeFile(join(RESULTS_DIR, `latest.md`), md);
  process.stderr.write(`\n✓ wrote results to ${RESULTS_DIR}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
