import { strictVickreySecondPrice } from "./auction-value";
import { isSelectableExecutorBid, type SelectableBidLike } from "./auction-selection";

export interface ProtocolBidLike extends SelectableBidLike {
  score: number;
}

export function areBidsVisible(now: number, bidWindowClosesAt: number): boolean {
  return now >= bidWindowClosesAt;
}

export function sortBidsByProtocolScore<T extends ProtocolBidLike>(
  bids: readonly T[],
): T[] {
  return [...bids].sort((a, b) => b.score - a.score || a.bid_price - b.bid_price);
}

export function visibleBidsUnderBudget<T extends ProtocolBidLike>(
  bids: readonly T[],
  maxBudget: number,
): T[] {
  return bids.filter(
    (bid) =>
      bid.bid_price <= maxBudget &&
      (bid.tool_availability?.status ?? "missing") !== "missing",
  );
}

export function eligibleExecutorBids<T extends ProtocolBidLike>(
  bids: readonly T[],
  maxBudget: number,
): T[] {
  return sortBidsByProtocolScore(
    bids.filter((bid) => isSelectableExecutorBid(bid, maxBudget)),
  );
}

export function protocolClearingPrice<T extends ProtocolBidLike>(args: {
  winner: T;
  runnerUp?: T;
  maxBudget: number;
}): number {
  return strictVickreySecondPrice({
    winnerBidPrice: args.winner.bid_price,
    runnerUpBidPrice: args.runnerUp?.bid_price,
    maxBudget: args.maxBudget,
  });
}
