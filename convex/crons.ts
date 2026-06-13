import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "hive payout accrual",
  { hours: 24 },
  internal.settlement.accrueCurrentAndPrevious,
  {},
);

export default crons;
