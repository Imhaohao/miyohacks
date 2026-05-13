"use node";

import { internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { AGENT_CONTACT_CATALOG, contactToSpecialistConfig } from "../lib/agent-contacts";
import { rankAgentContacts } from "../lib/agent-broker";
import { registerDiscoveredSpecialist } from "../lib/specialists/registry";
import { BID_WINDOW_SECONDS } from "./tasks";
import type { AgentContact } from "../lib/types";

const SHORTLIST_SIZE = 12;

function toConvexContact(contact: AgentContact) {
  return {
    agent_id: contact.agent_id,
    display_name: contact.display_name,
    sponsor: contact.sponsor,
    industry: contact.industry,
    protocol: contact.protocol,
    one_liner: contact.one_liner,
    capabilities: contact.capabilities,
    domain_tags: contact.domain_tags,
    ...(contact.endpoint_url ? { endpoint_url: contact.endpoint_url } : {}),
    ...(contact.agent_card_url ? { agent_card_url: contact.agent_card_url } : {}),
    auth_type: contact.auth_type,
    ...(contact.auth_env ? { auth_env: contact.auth_env } : {}),
    execution_status: contact.execution_status,
    verification_status: contact.verification_status,
    health_status: contact.health_status,
    supported_input_modes: contact.supported_input_modes,
    supported_output_modes: contact.supported_output_modes,
    artifact_types: contact.artifact_types,
    cost_baseline: contact.cost_baseline,
    starting_reputation: contact.starting_reputation,
    ...(contact.homepage_url ? { homepage_url: contact.homepage_url } : {}),
  };
}

export const shortlist = internalAction({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    const taskContext = await ctx.runQuery(internal.taskContexts._latestForTask, {
      task_id: args.task_id,
    });

    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "shortlisting",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "shortlist_started",
      payload: { contact_count: AGENT_CONTACT_CATALOG.length },
    });

    await ctx.runMutation(internal.agentContacts._seedCatalog, {
      contacts: AGENT_CONTACT_CATALOG.map(toConvexContact),
    });

    const liveAgents = (await ctx.runQuery(api.agents.list, {})) as Doc<"agents">[];
    const reputations = Object.fromEntries(
      liveAgents.map((agent) => [agent.agent_id, agent.reputation_score]),
    );
    const contextText = taskContext
      ? [
          taskContext.business.summary,
          taskContext.repo.summary,
          taskContext.routing.recommended_specialists.join(" "),
          taskContext.prompt_addendum,
        ].join("\n")
      : undefined;

    const ranked = rankAgentContacts({
      prompt: task.prompt,
      taskType: task.task_type,
      contextText,
      contacts: AGENT_CONTACT_CATALOG,
      reputations,
      limit: SHORTLIST_SIZE,
    });

    if (ranked.length === 0) {
      await ctx.runMutation(internal.tasks._setStatus, {
        task_id: args.task_id,
        status: "failed",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "shortlist_failed",
        payload: { reason: "no healthy agent contacts available" },
      });
      return;
    }

    for (const item of ranked) {
      const cfg = contactToSpecialistConfig(item.contact);
      registerDiscoveredSpecialist(cfg);
      await ctx.runMutation(internal.agents._ensureAgent, {
        agent_id: cfg.agent_id,
        display_name: cfg.display_name,
        sponsor: cfg.sponsor,
        capabilities: cfg.capabilities,
        system_prompt: cfg.system_prompt,
        cost_per_task_estimate: cfg.cost_baseline,
        starting_reputation: cfg.starting_reputation,
      });
    }

    await ctx.runMutation(internal.agentShortlists._replaceForTask, {
      task_id: args.task_id,
      items: ranked.map((item) => ({
        agent_id: item.contact.agent_id,
        rank: item.rank,
        score: item.score,
        reputation_score: item.reputation_score,
        reasons: item.reasons,
        industry: item.contact.industry,
        protocol: item.contact.protocol,
      })),
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "shortlist_ready",
      payload: {
        shortlist_size: ranked.length,
        candidates: ranked.map((item) => ({
          rank: item.rank,
          agent_id: item.contact.agent_id,
          display_name: item.contact.display_name,
          industry: item.contact.industry,
          protocol: item.contact.protocol,
          score: item.score,
          reasons: item.reasons,
        })),
      },
    });

    const closesAt = Date.now() + BID_WINDOW_SECONDS * 1000;
    await ctx.runMutation(internal.tasks._setBidWindow, {
      task_id: args.task_id,
      bid_window_closes_at: closesAt,
    });
    await ctx.runMutation(internal.tasks._setStatus, {
      task_id: args.task_id,
      status: "bidding",
    });

    await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, {
      task_id: args.task_id,
    });
    await ctx.scheduler.runAfter(BID_WINDOW_SECONDS * 1000, internal.auctions.resolve, {
      task_id: args.task_id,
    });
  },
});
