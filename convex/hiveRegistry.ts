"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { embedText, embeddingBackend } from "../lib/hive/embeddings";
import {
  buildCapabilityText,
  hiveAgentTransport,
  type HiveAgentCandidate,
} from "../lib/hive/registry-core";
import { discoverTools } from "../lib/mcp-outbound";

const AGENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;
const DEFAULT_REPUTATION = 0.5;
const OPENAI_EMBEDDING_MODEL = "openai:text-embedding-3-small";
const LOCAL_EMBEDDING_MODEL = "local-hash";

function embeddingModelName(): string {
  return embeddingBackend() === "openai"
    ? OPENAI_EMBEDDING_MODEL
    : LOCAL_EMBEDDING_MODEL;
}

function validateAgentId(agent_id: string): void {
  if (!AGENT_ID_RE.test(agent_id)) {
    throw new Error(
      `Invalid agent_id "${agent_id}" - must be kebab-case, 3-40 chars`,
    );
  }
}

function clampTopK(value: number | undefined): number {
  if (!Number.isFinite(value ?? 8)) return 8;
  return Math.min(32, Math.max(1, Math.trunc(value ?? 8)));
}

function toolSchemasForText(
  tools: Array<{ name?: string; description?: string }> | undefined,
): Array<{ name?: string; description?: string }> | undefined {
  return tools?.map((tool) => ({
    name: typeof tool.name === "string" ? tool.name : undefined,
    description:
      typeof tool.description === "string" ? tool.description : undefined,
  }));
}

function envValue(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const registerArgs = {
  agent_id: v.string(),
  display_name: v.string(),
  sponsor: v.string(),
  owner_id: v.optional(v.string()),
  capabilities: v.array(v.string()),
  one_liner: v.string(),
  system_prompt: v.string(),
  cost_baseline: v.number(),
  starting_reputation: v.optional(v.number()),
  mcp_endpoint: v.optional(v.string()),
  mcp_api_key_env: v.optional(v.string()),
  a2a_endpoint: v.optional(v.string()),
  a2a_agent_card_url: v.optional(v.string()),
  a2a_api_key_env: v.optional(v.string()),
  homepage_url: v.optional(v.string()),
  fetch_tools: v.optional(v.boolean()),
};

export const registerAgent = action({
  args: registerArgs,
  handler: async (ctx, args) => {
    validateAgentId(args.agent_id);
    if (args.capabilities.length === 0) {
      throw new Error("capabilities must include at least one entry");
    }
    if (args.cost_baseline <= 0) {
      throw new Error("cost_baseline must be greater than 0");
    }

    const starting_reputation =
      args.starting_reputation ?? DEFAULT_REPUTATION;
    const upsertArgs = {
      agent_id: args.agent_id,
      display_name: args.display_name,
      sponsor: args.sponsor,
      capabilities: args.capabilities,
      system_prompt: args.system_prompt,
      cost_baseline: args.cost_baseline,
      starting_reputation,
      one_liner: args.one_liner,
      discovered_for: "hive registry",
      discovery_source: "registry",
    } as const;
    const upsertOptionalArgs: {
      mcp_endpoint?: string;
      mcp_api_key_env?: string;
      homepage_url?: string;
      a2a_endpoint?: string;
      a2a_agent_card_url?: string;
      a2a_api_key_env?: string;
    } = {};
    if (args.mcp_endpoint) upsertOptionalArgs.mcp_endpoint = args.mcp_endpoint;
    if (args.mcp_api_key_env) {
      upsertOptionalArgs.mcp_api_key_env = args.mcp_api_key_env;
    }
    if (args.homepage_url) upsertOptionalArgs.homepage_url = args.homepage_url;
    if (args.a2a_endpoint) upsertOptionalArgs.a2a_endpoint = args.a2a_endpoint;
    if (args.a2a_agent_card_url) {
      upsertOptionalArgs.a2a_agent_card_url = args.a2a_agent_card_url;
    }
    if (args.a2a_api_key_env) {
      upsertOptionalArgs.a2a_api_key_env = args.a2a_api_key_env;
    }
    await ctx.runMutation(api.discoveredSpecialists.upsert, {
      ...upsertArgs,
      ...upsertOptionalArgs,
    });

    await ctx.runMutation(internal.hiveRegistryData._patchRegistrationMetadata, {
      agent_id: args.agent_id,
      owner_id: args.owner_id ?? args.sponsor,
      eval_status: "pending",
    });

    let mcpToolSchemas: Array<{ name?: string; description?: string }> | undefined;
    if (args.mcp_endpoint && args.fetch_tools !== false) {
      try {
        const tools = await discoverTools(
          args.mcp_endpoint,
          envValue(args.mcp_api_key_env),
        );
        mcpToolSchemas = tools;
        await ctx.runMutation(
          internal.hiveRegistryData._patchRegistrationMetadata,
          {
            agent_id: args.agent_id,
            mcp_tool_schemas: tools,
          },
        );
      } catch (err) {
        console.warn(
          `[hive-registry] tools/list failed agent=${args.agent_id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const capability_text = buildCapabilityText({
      display_name: args.display_name,
      sponsor: args.sponsor,
      one_liner: args.one_liner,
      capabilities: args.capabilities,
      mcp_tool_schemas: toolSchemasForText(mcpToolSchemas),
    });
    const embedding = await embedText(capability_text);
    const embedding_model = embeddingModelName();

    await ctx.runMutation(internal.hiveRegistryData._upsertEmbedding, {
      agent_id: args.agent_id,
      capability_text,
      embedding,
      embedding_model,
      eval_passed: false,
      cost_baseline: args.cost_baseline,
      reputation_score: starting_reputation,
      updated_at: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.hiveEvalGate.runEvalGate, {
      agent_id: args.agent_id,
    });

    return {
      agent_id: args.agent_id,
      registered: true,
      eval_status: "pending",
      embedding_model,
    };
  },
});

export const searchAgents = action({
  args: {
    query: v.string(),
    top_k: v.optional(v.number()),
    min_reputation: v.optional(v.number()),
    max_cost: v.optional(v.number()),
    include_unevaluated: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<HiveAgentCandidate[]> => {
    const query = args.query.trim();
    if (!query) throw new Error("query must be non-empty");

    const topK = clampTopK(args.top_k);
    const vector = await embedText(query);
    const limit = Math.min(64, topK * 4);
    const hits = args.include_unevaluated
      ? await ctx.vectorSearch("hive_agent_embeddings", "by_embedding", {
          vector,
          limit,
        })
      : await ctx.vectorSearch("hive_agent_embeddings", "by_embedding", {
          vector,
          limit,
          filter: (q) => q.eq("eval_passed", true),
        });

    const embeddingRows = await ctx.runQuery(
      internal.hiveRegistryData._getEmbeddingsByIds,
      { ids: hits.map((hit) => hit._id) },
    );
    const rowsById = new Map(
      embeddingRows.map((row) => [String(row._id), row]),
    );
    const minReputation = args.min_reputation ?? 0.3;
    const maxCost = args.max_cost ?? Number.POSITIVE_INFINITY;
    const filtered = hits
      .map((hit) => ({
        row: rowsById.get(String(hit._id)),
        similarity: hit._score,
      }))
      .filter(
        (hit): hit is {
          row: NonNullable<typeof hit.row>;
          similarity: number;
        } => {
          const row = hit.row;
          return (
            row !== undefined &&
            row.reputation_score >= minReputation &&
            row.cost_baseline <= maxCost
          );
        },
      )
      .slice(0, topK);

    const hydrated = await ctx.runQuery(
      internal.hiveRegistryData._hydrateCandidates,
      { agent_ids: filtered.map((hit) => hit.row.agent_id) },
    );
    const hydratedById = new Map(
      hydrated.map((row) => [row.specialist.agent_id, row]),
    );

    const candidates: HiveAgentCandidate[] = [];
    for (const hit of filtered) {
      const joined = hydratedById.get(hit.row.agent_id);
      if (!joined) continue;
      const specialist = joined.specialist;
      const candidate: HiveAgentCandidate = {
        agent_id: specialist.agent_id,
        display_name: specialist.display_name,
        sponsor: specialist.sponsor,
        one_liner: specialist.one_liner,
        capabilities: specialist.capabilities,
        cost_baseline: specialist.cost_baseline,
        reputation_score:
          joined.agent?.reputation_score ?? hit.row.reputation_score,
        similarity: hit.similarity,
        eval_status: specialist.eval_status ?? "pending",
        transport: hiveAgentTransport(specialist),
      };
      if (specialist.mcp_endpoint) {
        candidate.mcp_endpoint = specialist.mcp_endpoint;
      }
      if (specialist.a2a_endpoint) {
        candidate.a2a_endpoint = specialist.a2a_endpoint;
      }
      candidates.push(candidate);
    }
    return candidates;
  },
});

export const refreshEmbedding = internalAction({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const specialist = await ctx.runQuery(
      internal.discoveredSpecialists._getByAgentId,
      { agent_id: args.agent_id },
    );
    if (!specialist) {
      throw new Error(`agent ${args.agent_id} not found`);
    }
    const existing = await ctx.runQuery(
      internal.hiveRegistryData._getEmbeddingByAgentId,
      { agent_id: args.agent_id },
    );
    const agent = await ctx.runQuery(internal.agents._getByAgentId, {
      agent_id: args.agent_id,
    });
    const capability_text = buildCapabilityText({
      display_name: specialist.display_name,
      sponsor: specialist.sponsor,
      one_liner: specialist.one_liner,
      capabilities: specialist.capabilities,
      mcp_tool_schemas: toolSchemasForText(
        specialist.mcp_tool_schemas as
          | Array<{ name?: string; description?: string }>
          | undefined,
      ),
    });
    const embedding = await embedText(capability_text);
    const embedding_model = embeddingModelName();

    await ctx.runMutation(internal.hiveRegistryData._upsertEmbedding, {
      agent_id: args.agent_id,
      capability_text,
      embedding,
      embedding_model,
      eval_passed: existing?.eval_passed ?? false,
      cost_baseline: specialist.cost_baseline,
      reputation_score:
        agent?.reputation_score ?? specialist.starting_reputation,
      updated_at: Date.now(),
    });

    return { agent_id: args.agent_id, refreshed: true, embedding_model };
  },
});
