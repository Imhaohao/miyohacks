import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { corsPreflight, jsonError, jsonOk } from "@/lib/http";
import {
  probeSpecialistConnection,
  type ConnectionProbe,
} from "@/lib/specialists/connection-runtime";
import type {
  AgentIndustry,
  AgentProtocol,
  AgentRole,
  SpecialistConfig,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;
const AUTH_ENV_RE = /^[A-Z][A-Z0-9_]*$/;
const INDUSTRIES = new Set<AgentIndustry>([
  "software",
  "finance",
  "legal",
  "healthcare",
  "ecommerce",
  "marketing",
  "sales",
  "operations",
  "data",
  "creative-media",
]);
const ROLES = new Set<AgentRole>(["executive", "context", "executor", "judge"]);

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function text(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredText(body: Record<string, unknown>, key: string): string {
  const value = text(body, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function parseProtocol(body: Record<string, unknown>): AgentProtocol {
  const protocol = requiredText(body, "protocol").toLowerCase();
  if (protocol !== "mcp" && protocol !== "a2a") {
    throw new Error("protocol must be either mcp or a2a");
  }
  return protocol;
}

function parseUrl(body: Record<string, unknown>, key: string): string | undefined {
  const value = text(body, key);
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
}

function parseCapabilities(body: Record<string, unknown>): string[] {
  const value = body.capabilities;
  const raw =
    Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[,\n]/)
        : [];
  const capabilities = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
  if (capabilities.length === 0) {
    throw new Error("capabilities must include at least one capability");
  }
  return Array.from(new Set(capabilities));
}

function parseNumber(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = body[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : fallback;
  if (!Number.isFinite(parsed)) throw new Error(`${key} must be a number`);
  return parsed;
}

function parseIndustry(body: Record<string, unknown>): AgentIndustry {
  const industry = (text(body, "industry") ?? "software") as AgentIndustry;
  if (!INDUSTRIES.has(industry)) throw new Error("industry is not supported");
  return industry;
}

function parseRole(body: Record<string, unknown>): AgentRole {
  const role = (text(body, "agent_role") ?? "executor") as AgentRole;
  if (!ROLES.has(role)) throw new Error("agent_role is not supported");
  return role;
}

function readinessFor(probe: ConnectionProbe) {
  if (probe.status === "available") {
    return {
      status: "verified",
      message:
        probe.toolNames && probe.toolNames.length > 0
          ? `verified: ${probe.toolNames.length} MCP tool(s) visible`
          : probe.cardName
            ? `verified: A2A card ${probe.cardName}`
            : "verified endpoint",
    };
  }
  return {
    status: "not_ready",
    message: probe.reason,
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const protocol = parseProtocol(body);
    const agent_id = requiredText(body, "agent_id");
    if (!AGENT_ID_RE.test(agent_id)) {
      throw new Error("agent_id must be kebab-case, 3-40 characters");
    }
    const display_name = requiredText(body, "display_name");
    const endpoint = parseUrl(body, "endpoint_url");
    if (!endpoint) throw new Error("endpoint_url is required");
    const agentCardUrl =
      protocol === "a2a"
        ? parseUrl(body, "agent_card_url")
        : undefined;
    if (protocol === "a2a" && !agentCardUrl) {
      throw new Error("agent_card_url is required for A2A verification");
    }
    const authEnv = text(body, "auth_env");
    if (authEnv && !AUTH_ENV_RE.test(authEnv)) {
      throw new Error("auth_env must look like an environment variable name");
    }
    const costBaseline = parseNumber(body, "cost_baseline", 0.5);
    if (costBaseline <= 0) throw new Error("cost_baseline must be positive");
    const startingReputation = parseNumber(body, "starting_reputation", 0.55);
    if (startingReputation < 0.05 || startingReputation > 1) {
      throw new Error("starting_reputation must be between 0.05 and 1.0");
    }
    const capabilities = parseCapabilities(body);
    const oneLiner =
      text(body, "one_liner") ??
      `${display_name} registered with a live ${protocol.toUpperCase()} endpoint.`;
    const config: SpecialistConfig = {
      agent_id,
      display_name,
      sponsor: text(body, "sponsor") ?? "Registered specialist",
      agent_role: parseRole(body),
      capabilities,
      system_prompt:
        text(body, "system_prompt") ??
        [
          `You are ${display_name}, a registered specialist in Arbor's agent auction protocol.`,
          oneLiner,
          `Your capabilities are: ${capabilities.join(", ")}.`,
          "Bid only when the task fits your real endpoint-backed tools. Decline honestly when it does not.",
        ].join("\n"),
      cost_baseline: costBaseline,
      starting_reputation: startingReputation,
      one_liner: oneLiner,
      industry: parseIndustry(body),
      protocol,
      mcp_endpoint: protocol === "mcp" ? endpoint : undefined,
      a2a_endpoint: protocol === "a2a" ? endpoint : undefined,
      a2a_agent_card_url: agentCardUrl,
      mcp_api_key_env: authEnv,
      homepage_url: parseUrl(body, "homepage_url"),
      discovered: true,
      discovery_source: "registered",
      discovered_for: "public specialist registration",
    };

    const probe = await probeSpecialistConnection(config, { force: true });
    const readiness = readinessFor(probe);

    const result = await convex().mutation(api.discoveredSpecialists.create, stripUndefined({
      agent_id: config.agent_id,
      display_name: config.display_name,
      sponsor: config.sponsor,
      agent_role: config.agent_role,
      capabilities: config.capabilities,
      system_prompt: config.system_prompt,
      cost_baseline: config.cost_baseline,
      starting_reputation: config.starting_reputation,
      one_liner: config.one_liner,
      industry: config.industry,
      discovered_for: config.discovered_for!,
      discovery_source: "registered",
      protocol,
      mcp_endpoint: config.mcp_endpoint,
      mcp_api_key_env: config.mcp_api_key_env,
      a2a_endpoint: config.a2a_endpoint,
      a2a_agent_card_url: config.a2a_agent_card_url,
      homepage_url: config.homepage_url,
      rationale:
        "Registered by public specialist registration flow; readiness is based on the recorded verification probe.",
      last_probe_status: probe.status,
      last_probe_reason: probe.reason,
      last_probe_at: probe.checkedAt,
      last_probe_latency_ms: probe.latencyMs,
      verified_tool_count: probe.toolCount,
      registered_via: "/agents",
    }));

    return jsonOk(
      {
        specialist: {
          agent_id,
          display_name,
          protocol,
          endpoint_url: endpoint,
          agent_card_url: agentCardUrl,
          capabilities,
        },
        readiness,
        probe,
        persisted: result,
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("already exists") ? 409 : 400;
    return jsonError(message, status);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
