import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AGENT_CONTACT_CATALOG } from "../lib/agent-contacts";
import { effectiveExecutionStatus } from "../lib/agent-execution-status";
import {
  mockPolicyForExecutionStatus,
  mockPolicyMetadata,
} from "../lib/mock-policy";
import { rosterMetadataFor } from "../lib/specialists/roster";
import type {
  AgentHealthStatus,
  AgentProtocol,
  AgentVerificationStatus,
} from "../lib/types";

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
    v.literal("arbor_sandbox_adapter"),
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
  mock_policy: v.optional(
    v.union(v.literal("strict_no_mock"), v.literal("demo_mock_llm")),
  ),
  mock_policy_label: v.optional(v.string()),
  mock_policy_description: v.optional(v.string()),
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
    const discovered = await ctx.db.query("discovered_specialists").collect();

    const catalogContacts = AGENT_CONTACT_CATALOG.map((contact) => {
      const stored = persistedById.get(contact.agent_id);
      const live = liveById.get(contact.agent_id);
      const execution_status = effectiveExecutionStatus({
        agent_id: contact.agent_id,
        protocol: contact.protocol,
        endpoint_url: contact.endpoint_url,
        agent_card_url: contact.agent_card_url,
      });
      return {
        ...contact,
        ...(stored
          ? {
              health_status: stored.health_status,
              verification_status: stored.verification_status,
              updated_at: stored.updated_at,
            }
          : { updated_at: null }),
        execution_status,
        ...mockPolicyMetadata(mockPolicyForExecutionStatus(execution_status)),
        reputation_score: live?.reputation_score ?? contact.starting_reputation,
        total_tasks_completed: live?.total_tasks_completed ?? 0,
        total_disputes_lost: live?.total_disputes_lost ?? 0,
      };
    });
    const catalogIds = new Set(catalogContacts.map((contact) => contact.agent_id));
    const discoveredContacts = discovered
      .filter((specialist) => !catalogIds.has(specialist.agent_id))
      .map((specialist) => {
        const protocol = protocolForDiscovered(specialist);
        const endpoint_url =
          protocol === "mcp"
            ? specialist.mcp_endpoint
            : specialist.a2a_endpoint ?? specialist.a2a_agent_card_url;
        const execution_status = effectiveExecutionStatus({
          agent_id: specialist.agent_id,
          protocol,
          endpoint_url,
          agent_card_url: specialist.a2a_agent_card_url,
          mcp_endpoint: specialist.mcp_endpoint,
          a2a_endpoint: specialist.a2a_endpoint,
          a2a_agent_card_url: specialist.a2a_agent_card_url,
        });
        const live = liveById.get(specialist.agent_id);
        const roster = rosterMetadataFor({
          agent_id: specialist.agent_id,
          discovered: true,
          discovery_source: specialist.discovery_source,
          discovered_for: specialist.discovered_for,
        });
        return {
          agent_id: specialist.agent_id,
          display_name: specialist.display_name,
          sponsor: specialist.sponsor,
          industry: specialist.industry ?? "software",
          agent_role: specialist.agent_role,
          protocol,
          one_liner: specialist.one_liner,
          capabilities: specialist.capabilities,
          domain_tags: specialist.capabilities,
          endpoint_url,
          agent_card_url: specialist.a2a_agent_card_url,
          auth_type: specialist.mcp_api_key_env ? "api_key" : "none",
          auth_env: specialist.mcp_api_key_env,
          execution_status,
          verification_status: verificationStatusForDiscovered(
            specialist.last_probe_status,
            endpoint_url,
            protocol,
          ),
          health_status: healthStatusForProbe(specialist.last_probe_status),
          supported_input_modes: ["text/plain", "application/json"],
          supported_output_modes: ["text/plain", "application/json"],
          artifact_types: ["text", "json"],
          cost_baseline: specialist.cost_baseline,
          starting_reputation: specialist.starting_reputation,
          homepage_url: specialist.homepage_url,
          ...roster,
          ...mockPolicyMetadata(mockPolicyForExecutionStatus(execution_status)),
          reputation_score:
            live?.reputation_score ?? specialist.starting_reputation,
          total_tasks_completed: live?.total_tasks_completed ?? 0,
          total_disputes_lost: live?.total_disputes_lost ?? 0,
          updated_at: updatedAtForDiscovered(specialist),
        };
      });

    return [...catalogContacts, ...discoveredContacts]
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

type DiscoveredSpecialistRow = {
  agent_id: string;
  protocol?: AgentProtocol;
  mcp_endpoint?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  discovery_source?: "catalog" | "registry" | "synthesized" | "registered";
  last_probe_status?:
    | "available"
    | "missing_auth"
    | "not_configured"
    | "unreachable"
    | "timeout"
    | "auth_failed"
    | "protocol_error";
  last_probe_at?: string;
  created_at: number;
};

function protocolForDiscovered(row: DiscoveredSpecialistRow): AgentProtocol {
  if (row.protocol) return row.protocol;
  if (row.mcp_endpoint) return "mcp";
  if (row.a2a_endpoint || row.a2a_agent_card_url) return "a2a";
  return row.discovery_source === "synthesized" ? "mock" : "manual";
}

function healthStatusForProbe(
  status: DiscoveredSpecialistRow["last_probe_status"],
): AgentHealthStatus {
  if (status === "available") return "healthy";
  if (status === "missing_auth" || status === "auth_failed") {
    return "auth_required";
  }
  if (status === "unreachable" || status === "timeout") return "unreachable";
  if (status === "protocol_error") return "degraded";
  return "unknown";
}

function verificationStatusForDiscovered(
  status: DiscoveredSpecialistRow["last_probe_status"],
  endpointUrl: string | undefined,
  protocol: AgentProtocol,
): AgentVerificationStatus {
  if (status === "available") return "verified";
  if (protocol === "mock") return "mock";
  if (endpointUrl) return "configured";
  return "unverified";
}

function updatedAtForDiscovered(row: DiscoveredSpecialistRow): number {
  if (row.last_probe_at) {
    const parsed = Date.parse(row.last_probe_at);
    if (Number.isFinite(parsed)) return parsed;
  }
  return row.created_at;
}

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
