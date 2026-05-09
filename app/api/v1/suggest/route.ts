import { NextRequest } from "next/server";
import {
  handleSuggestSpecialists,
  type SuggestSpecialistsArgs,
} from "@/lib/mcp-tools";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Partial<SuggestSpecialistsArgs>;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return jsonError("prompt (string) is required", 400);
  }
  try {
    const result = await handleSuggestSpecialists(body as SuggestSpecialistsArgs);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
