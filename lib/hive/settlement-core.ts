export interface SettledRow {
  task_id: string;
  agent_id: string;
  owner_id: string;
  status: "complete" | "disputed";
  price_paid: number;
}

export interface OwnerAgentAccrual {
  owner_id: string;
  agent_id: string;
  tasks_won: number;
  tasks_accepted: number;
  tasks_lost: number;
  gross_volume: number;
  platform_fee: number;
  estimated_payout: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function periodOf(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function currentPeriod(now: number): string {
  return periodOf(now);
}

export function periodBounds(period: string): { startMs: number; endMs: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error("period must be YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("period month must be 01..12");
  const startMs = Date.UTC(year, month - 1, 1);
  const endMs = Date.UTC(year, month, 1);
  return { startMs, endMs };
}

export function computePayout(
  rows: SettledRow[],
  feeBps: number,
): OwnerAgentAccrual[] {
  const safeFeeBps = Number.isFinite(feeBps) ? Math.max(0, feeBps) : 1000;
  const byOwnerAgent = new Map<string, OwnerAgentAccrual>();

  for (const row of rows) {
    const key = `${row.owner_id}\0${row.agent_id}`;
    const current = byOwnerAgent.get(key) ?? {
      owner_id: row.owner_id,
      agent_id: row.agent_id,
      tasks_won: 0,
      tasks_accepted: 0,
      tasks_lost: 0,
      gross_volume: 0,
      platform_fee: 0,
      estimated_payout: 0,
    };

    current.tasks_won += 1;
    if (row.status === "complete") {
      current.tasks_accepted += 1;
      current.gross_volume += Math.max(0, row.price_paid);
    } else {
      // This layer only scans winning rows. Until bid-history settlement is
      // modeled per owner, "lost" means a won task that ended disputed.
      current.tasks_lost += 1;
    }

    byOwnerAgent.set(key, current);
  }

  return Array.from(byOwnerAgent.values())
    .map((row) => {
      const gross = roundMoney(row.gross_volume);
      const platform_fee = roundMoney((gross * safeFeeBps) / 10000);
      return {
        ...row,
        gross_volume: gross,
        platform_fee,
        estimated_payout: roundMoney(gross - platform_fee),
      };
    })
    .sort((a, b) =>
      a.owner_id === b.owner_id
        ? a.agent_id.localeCompare(b.agent_id)
        : a.owner_id.localeCompare(b.owner_id),
    );
}
