import { NextRequest } from "next/server";
import { handleScratchpadRecall } from "@/lib/mcp-tools";
import { corsPreflight, jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ dagId: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { dagId } = await ctx.params;
  if (!dagId) return jsonError("dag id is required", 400);
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return jsonError("q query parameter is required", 400);
  const rawLimit = url.searchParams.get("limit");
  const limit =
    rawLimit !== null && rawLimit !== "" ? Number(rawLimit) : undefined;
  if (limit !== undefined && !Number.isFinite(limit)) {
    return jsonError("limit must be a finite number", 400);
  }

  try {
    return jsonOk(
      await handleScratchpadRecall({
        dag_id: dagId,
        query: q,
        limit,
      }),
    );
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
