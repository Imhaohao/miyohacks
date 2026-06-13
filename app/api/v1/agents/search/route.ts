import { ConvexHttpClient } from "convex/browser";
import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { corsPreflight, jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function optionalFiniteNumber(
  params: URLSearchParams,
  field: string,
): number | Response | undefined {
  const raw = params.get(field);
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return jsonError(`${field} must be a finite number`, 400);
  }
  return value;
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return jsonError("q query parameter is required", 400);

  const top_k = optionalFiniteNumber(url.searchParams, "top_k");
  if (isResponse(top_k)) return top_k;
  if (top_k !== undefined && top_k <= 0) {
    return jsonError("top_k must be greater than 0", 400);
  }

  const min_reputation = optionalFiniteNumber(
    url.searchParams,
    "min_reputation",
  );
  if (isResponse(min_reputation)) return min_reputation;

  const max_cost = optionalFiniteNumber(url.searchParams, "max_cost");
  if (isResponse(max_cost)) return max_cost;

  const searchArgs: {
    query: string;
    top_k?: number;
    min_reputation?: number;
    max_cost?: number;
    include_unevaluated?: boolean;
  } = { query: q };
  if (top_k !== undefined) searchArgs.top_k = top_k;
  if (min_reputation !== undefined) {
    searchArgs.min_reputation = min_reputation;
  }
  if (max_cost !== undefined) searchArgs.max_cost = max_cost;
  if (url.searchParams.get("include_unevaluated") === "true") {
    searchArgs.include_unevaluated = true;
  }

  try {
    const result = await convex().action(
      api.hiveRegistry.searchAgents,
      searchArgs,
    );
    return jsonOk({ query: q, candidates: result });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
