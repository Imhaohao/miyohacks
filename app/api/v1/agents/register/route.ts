import { ConvexHttpClient } from "convex/browser";
import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { corsPreflight, jsonError, jsonOk } from "@/lib/http";
import type { HiveAgentRegistration } from "@/lib/hive/registry-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  body: Record<string, unknown>,
  field: string,
): string | Response {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    return jsonError(`${field} (non-empty string) is required`, 400);
  }
  return value.trim();
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | Response | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    return jsonError(`${field} must be a non-empty string when provided`, 400);
  }
  return value.trim();
}

function optionalNumber(
  body: Record<string, unknown>,
  field: string,
): number | Response | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return jsonError(`${field} must be a finite number when provided`, 400);
  }
  return value;
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function POST(req: NextRequest) {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (!isRecord(parsed)) {
    return jsonError("JSON body must be an object", 400);
  }

  const agent_id = requiredString(parsed, "agent_id");
  if (isResponse(agent_id)) return agent_id;
  if (!AGENT_ID_RE.test(agent_id)) {
    return jsonError("agent_id must be kebab-case, 3-40 chars", 400);
  }

  const display_name = requiredString(parsed, "display_name");
  if (isResponse(display_name)) return display_name;
  const sponsor = requiredString(parsed, "sponsor");
  if (isResponse(sponsor)) return sponsor;
  const one_liner = requiredString(parsed, "one_liner");
  if (isResponse(one_liner)) return one_liner;
  const system_prompt = requiredString(parsed, "system_prompt");
  if (isResponse(system_prompt)) return system_prompt;

  const capabilitiesValue = parsed.capabilities;
  if (
    !Array.isArray(capabilitiesValue) ||
    capabilitiesValue.length === 0 ||
    !capabilitiesValue.every((item) => typeof item === "string" && item.trim())
  ) {
    return jsonError(
      "capabilities must be a non-empty array of non-empty strings",
      400,
    );
  }
  const capabilities = capabilitiesValue.map((item) => item.trim());

  const costBaselineValue = parsed.cost_baseline;
  if (
    typeof costBaselineValue !== "number" ||
    !Number.isFinite(costBaselineValue) ||
    costBaselineValue <= 0
  ) {
    return jsonError("cost_baseline (number > 0) is required", 400);
  }

  const registration: HiveAgentRegistration = {
    agent_id,
    display_name,
    sponsor,
    capabilities,
    one_liner,
    system_prompt,
    cost_baseline: costBaselineValue,
  };

  const owner_id = optionalString(parsed, "owner_id");
  if (isResponse(owner_id)) return owner_id;
  if (owner_id) registration.owner_id = owner_id;

  const starting_reputation = optionalNumber(parsed, "starting_reputation");
  if (isResponse(starting_reputation)) return starting_reputation;
  if (starting_reputation !== undefined) {
    registration.starting_reputation = starting_reputation;
  }

  for (const field of [
    "mcp_endpoint",
    "mcp_api_key_env",
    "a2a_endpoint",
    "a2a_agent_card_url",
    "a2a_api_key_env",
    "homepage_url",
  ] as const) {
    const value = optionalString(parsed, field);
    if (isResponse(value)) return value;
    if (value) registration[field] = value;
  }

  if (parsed.fetch_tools !== undefined) {
    if (typeof parsed.fetch_tools !== "boolean") {
      return jsonError("fetch_tools must be boolean when provided", 400);
    }
    registration.fetch_tools = parsed.fetch_tools;
  }

  try {
    const result = await convex().action(
      api.hiveRegistry.registerAgent,
      registration,
    );
    return jsonOk(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("collides with a sponsor")) {
      return jsonError(message, 409);
    }
    return jsonError(message, 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
