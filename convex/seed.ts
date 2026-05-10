import { mutation } from "./_generated/server";
import { SPECIALISTS } from "../lib/specialists/registry";

export const seedAgents = mutation({
  args: {},
  handler: async (ctx) => {
    for (const spec of SPECIALISTS) {
      const existing = await ctx.db
        .query("agents")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", spec.agent_id))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          display_name: spec.display_name,
          sponsor: spec.sponsor,
          capabilities: spec.capabilities,
          system_prompt: spec.system_prompt,
          cost_per_task_estimate: spec.cost_baseline,
          reputation_score: spec.starting_reputation,
        });
        continue;
      }
      await ctx.db.insert("agents", {
        agent_id: spec.agent_id,
        display_name: spec.display_name,
        sponsor: spec.sponsor,
        capabilities: spec.capabilities,
        system_prompt: spec.system_prompt,
        cost_per_task_estimate: spec.cost_baseline,
        reputation_score: spec.starting_reputation,
        total_tasks_completed: 0,
        total_disputes_lost: 0,
      });
    }
    return { ok: true };
  },
});
