import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AGENT_CONTACT_CATALOG } from "../lib/agent-contacts";

const contactValidator = v.object({
  agent_id: v.string(),
  display_name: v.string(),
  sponsor: v.string(),
  industry: v.string(),
  agent_role: v.optional(
    v.union(
      v.literal("executive"),
      v.literal("context"),
      v.literal("executor"),
      v.literal("judge"),
    ),
  ),
  protocol: v.union(
    v.literal("a2a"),
    v.literal("mcp"),
    v.literal("mock"),
    v.literal("manual"),
  ),
  one_liner: v.string(),
  capabilities: v.array(v.string()),
  domain_tags: v.array(v.string()),
  endpoint_url: v.optional(v.string()),
  agent_card_url: v.optional(v.string()),
  auth_type: v.string(),
  auth_env: v.optional(v.string()),
  execution_status: v.union(
    v.literal("native_mcp"),
    v.literal("native_a2a"),
    v.literal("arbor_real_adapter"),
    v.literal("needs_vendor_a2a_endpoint"),
    v.literal("mock_unconnected"),
  ),
  verification_status: v.string(),
  health_status: v.string(),
  supported_input_modes: v.array(v.string()),
  supported_output_modes: v.array(v.string()),
  artifact_types: v.array(v.string()),
  cost_baseline: v.number(),
  starting_reputation: v.number(),
  homepage_url: v.optional(v.string()),
});

export const list = query({
  args: {
    industry: v.optional(v.string()),
    protocol: v.optional(v.string()),
    verified_only: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const persisted = await ctx.db.query("agent_contacts").collect();
    const persistedById = new Map(persisted.map((contact) => [contact.agent_id, contact]));
    const liveAgents = await ctx.db.query("agents").collect();
    const liveById = new Map(liveAgents.map((agent) => [agent.agent_id, agent]));

    return AGENT_CONTACT_CATALOG.map((contact) => {
      const stored = persistedById.get(contact.agent_id);
      const live = liveById.get(contact.agent_id);
      return {
        ...contact,
        ...(stored
          ? {
              health_status: stored.health_status,
              execution_status: stored.execution_status ?? contact.execution_status,
              verification_status: stored.verification_status,
              updated_at: stored.updated_at,
            }
          : { updated_at: null }),
        reputation_score: live?.reputation_score ?? contact.starting_reputation,
        total_tasks_completed: live?.total_tasks_completed ?? 0,
        total_disputes_lost: live?.total_disputes_lost ?? 0,
      };
    })
      .filter((contact) => !args.industry || contact.industry === args.industry)
      .filter((contact) => !args.protocol || contact.protocol === args.protocol)
      .filter(
        (contact) =>
          !args.verified_only || contact.verification_status === "verified",
      )
      .sort((a, b) => {
        if (b.reputation_score !== a.reputation_score) {
          return b.reputation_score - a.reputation_score;
        }
        return a.agent_id.localeCompare(b.agent_id);
      });
  },
});

export const _seedCatalog = internalMutation({
  args: {
    contacts: v.array(contactValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const contact of args.contacts) {
      const existing = await ctx.db
        .query("agent_contacts")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", contact.agent_id))
        .first();
      const row = {
        ...contact,
        updated_at: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("agent_contacts", row);
      }
    }
    return { count: args.contacts.length };
  },
});
