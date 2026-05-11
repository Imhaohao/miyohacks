export interface AuctionQualityInputs {
  taskFitScore: number;
  historicalQuality: number;
  acceptanceRate: number;
  reliabilityScore: number;
  speedScore: number;
  estimateAccuracy: number;
  availabilityScore: number;
}

export interface AuctionValueInputs extends AuctionQualityInputs {
  bidPrice: number;
  estimatedSeconds: number;
  taskType: string;
}

export interface AuctionValueResult {
  expectedQuality: number;
  latencyPenalty: number;
  effectivePrice: number;
  valueScore: number;
}

const QUALITY_WEIGHTS = {
  taskFit: 0.28,
  historicalQuality: 0.24,
  acceptance: 0.14,
  reliability: 0.12,
  speed: 0.08,
  estimate: 0.08,
  availability: 0.06,
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function latencyWeightForTask(taskType: string): number {
  const normalized = taskType.toLowerCase();
  if (normalized.includes("incident") || normalized.includes("debug")) return 0.003;
  if (normalized.includes("implementation") || normalized.includes("code")) return 0.0012;
  if (normalized.includes("research") || normalized.includes("strategy")) return 0.0006;
  return 0.0009;
}

export function computeLatencyPenalty(
  estimatedSeconds: number,
  taskType: string,
): number {
  const seconds = Math.max(0, Number.isFinite(estimatedSeconds) ? estimatedSeconds : 0);
  return roundMoney((seconds / 60) * latencyWeightForTask(taskType));
}

export function computeExpectedQuality(inputs: AuctionQualityInputs): number {
  return clamp01(
    QUALITY_WEIGHTS.taskFit * clamp01(inputs.taskFitScore) +
      QUALITY_WEIGHTS.historicalQuality * clamp01(inputs.historicalQuality) +
      QUALITY_WEIGHTS.acceptance * clamp01(inputs.acceptanceRate) +
      QUALITY_WEIGHTS.reliability * clamp01(inputs.reliabilityScore) +
      QUALITY_WEIGHTS.speed * clamp01(inputs.speedScore) +
      QUALITY_WEIGHTS.estimate * clamp01(inputs.estimateAccuracy) +
      QUALITY_WEIGHTS.availability * clamp01(inputs.availabilityScore),
  );
}

export function computeAuctionValue(inputs: AuctionValueInputs): AuctionValueResult {
  const expectedQuality = computeExpectedQuality(inputs);
  const latencyPenalty = computeLatencyPenalty(inputs.estimatedSeconds, inputs.taskType);
  const effectivePrice = Math.max(0.01, roundMoney(inputs.bidPrice + latencyPenalty));
  return {
    expectedQuality,
    latencyPenalty,
    effectivePrice,
    valueScore: expectedQuality / effectivePrice,
  };
}

export function qualityAdjustedVickreyPrice(args: {
  winnerExpectedQuality: number;
  runnerUpValueScore?: number;
  winnerBidPrice: number;
  maxBudget: number;
}): number {
  if (!Number.isFinite(args.runnerUpValueScore) || !args.runnerUpValueScore) {
    return Math.min(args.maxBudget, roundMoney(args.winnerBidPrice));
  }

  const clearingPrice = args.winnerExpectedQuality / args.runnerUpValueScore;
  return Math.min(args.maxBudget, roundMoney(Math.max(0.01, clearingPrice)));
}
