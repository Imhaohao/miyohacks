import { NextRequest } from "next/server";
import {
  handleUpsertProductContext,
  type UpsertProductContextArgs,
} from "@/lib/mcp-tools";
import { resolveApiIdentity } from "@/lib/api-identity";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Partial<UpsertProductContextArgs>;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  if (typeof body.company_name !== "string" || !body.company_name.trim()) {
    return jsonError("company_name (string) is required", 400);
  }
  if (
    typeof body.business_context !== "string" ||
    !body.business_context.trim()
  ) {
    return jsonError("business_context (string) is required", 400);
  }

  try {
    const identity = await resolveApiIdentity(req);
    if (!identity) return jsonError("unauthorized", 401);
    const result = await handleUpsertProductContext(
      body as UpsertProductContextArgs,
      identity,
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
