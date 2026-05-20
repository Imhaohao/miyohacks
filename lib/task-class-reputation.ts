export const TASK_CLASS_REPUTATION_MIN_HISTORY = 3;
export const LEGACY_TASK_CLASS = "legacy";

export interface ReputationSummaryLike {
  tasks: number;
  speed: number;
  estimate: number;
  quality: number;
  value: number;
  overall: number;
  acceptance_rate: number;
  task_class?: string;
}

export function normalizeTaskClass(taskType: string | undefined | null): string {
  const normalized = (taskType ?? "general")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "general";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function taskClassReputationForScoring(args: {
  topLineReputation: number;
  taskClassSummary: ReputationSummaryLike;
  minHistory?: number;
}): {
  reputation_score: number;
  reputation_source: "global" | "task_class";
  task_class_history_count: number;
  task_class_enough_history: boolean;
} {
  const minHistory = args.minHistory ?? TASK_CLASS_REPUTATION_MIN_HISTORY;
  const taskClassHistory = Math.max(0, args.taskClassSummary.tasks);
  const enoughHistory = taskClassHistory >= minHistory;
  return {
    reputation_score: enoughHistory
      ? clamp01(args.taskClassSummary.overall)
      : clamp01(args.topLineReputation),
    reputation_source: enoughHistory ? "task_class" : "global",
    task_class_history_count: taskClassHistory,
    task_class_enough_history: enoughHistory,
  };
}
