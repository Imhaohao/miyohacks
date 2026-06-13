/**
 * Scoring for the router benchmark.
 *
 * Metrics per strategy:
 *   acc@1  — fraction of tasks where the top pick is a gold specialist
 *   acc@3  — fraction where a gold specialist appears in the top 3
 *   MRR    — mean reciprocal rank of the first gold hit
 *
 * Also breaks acc@1 down by domain and by adversarial-vs-plain, since the
 * council's concern was specifically cross-domain mis-routing.
 */

import type { RouterTask } from "./tasks";

export interface TaskScore {
  taskId: string;
  domain: string;
  goldCapability: string;
  adversarial: boolean;
  picked: string;
  top1: boolean;
  top3: boolean;
  rr: number;
}

export function scoreTask(task: RouterTask, ranked: string[]): TaskScore {
  const gold = new Set(task.gold_specialist_ids);
  const top1 = ranked.length > 0 && gold.has(ranked[0]);
  const top3 = ranked.slice(0, 3).some((id) => gold.has(id));
  let rr = 0;
  for (let i = 0; i < ranked.length; i++) {
    if (gold.has(ranked[i])) {
      rr = 1 / (i + 1);
      break;
    }
  }
  return {
    taskId: task.id,
    domain: task.domain,
    goldCapability: task.gold_capability,
    adversarial: !!task.adversarial,
    picked: ranked[0] ?? "(none)",
    top1,
    top3,
    rr,
  };
}

export interface StrategyScore {
  strategy: string;
  ran: boolean;
  note?: string;
  n: number;
  acc1: number;
  acc3: number;
  mrr: number;
  acc1_adversarial: number;
  acc1_plain: number;
  perDomainAcc1: Record<string, number>;
  taskScores: TaskScore[];
}

export function aggregate(
  strategy: string,
  taskScores: TaskScore[],
  opts: { ran: boolean; note?: string } = { ran: true },
): StrategyScore {
  const n = taskScores.length;
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  const adv = taskScores.filter((t) => t.adversarial);
  const plain = taskScores.filter((t) => !t.adversarial);

  const byDomain = new Map<string, TaskScore[]>();
  for (const t of taskScores) {
    const arr = byDomain.get(t.domain) ?? [];
    arr.push(t);
    byDomain.set(t.domain, arr);
  }
  const perDomainAcc1: Record<string, number> = {};
  for (const [domain, arr] of byDomain) {
    perDomainAcc1[domain] = mean(arr.map((t) => (t.top1 ? 1 : 0)));
  }

  return {
    strategy,
    ran: opts.ran,
    note: opts.note,
    n,
    acc1: mean(taskScores.map((t) => (t.top1 ? 1 : 0))),
    acc3: mean(taskScores.map((t) => (t.top3 ? 1 : 0))),
    mrr: mean(taskScores.map((t) => t.rr)),
    acc1_adversarial: mean(adv.map((t) => (t.top1 ? 1 : 0))),
    acc1_plain: mean(plain.map((t) => (t.top1 ? 1 : 0))),
    perDomainAcc1,
    taskScores,
  };
}

export function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
