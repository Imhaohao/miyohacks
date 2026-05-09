import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Reputation event history for one agent, oldest first. Used by /agents to
 * render a per-specialist reputation-over-time line chart.
 */
export const history = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("reputation_events")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .collect();
    return events.sort((a, b) => a._creationTime - b._creationTime);
  },
});
