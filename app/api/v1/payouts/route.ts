import { ConvexHttpClient } from "convex/browser";
import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { currentPeriod } from "@/lib/hive/settlement-core";
import { corsPreflight, jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const owner_id = url.searchParams.get("owner_id")?.trim();
  if (!owner_id) return jsonError("owner_id query parameter is required", 400);
  const period = url.searchParams.get("period")?.trim() || currentPeriod(Date.now());

  try {
    const payouts = await convex().query(api.settlement.payoutsForOwner, {
      owner_id,
      period,
    });
    return jsonOk({ owner_id, period, payouts });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
