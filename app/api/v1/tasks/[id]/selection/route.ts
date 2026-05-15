import { ConvexHttpClient } from "convex/browser";
import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { resolveApiIdentity } from "@/lib/api-identity";
import { jsonError, jsonOk } from "@/lib/http";
import { paymentServerSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  let body: { bid_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (body.action !== "repair_invalid_winner" && !body.bid_id) {
    return jsonError("bid_id is required", 400);
  }

  try {
    const identity = await resolveApiIdentity(req);
    if (!identity) return jsonError("unauthorized", 401);
    if (body.action === "repair_invalid_winner") {
      const result = await convex().mutation(
        api.auctionSelection.repairInvalidWinnerForAccount,
        {
          server_secret: paymentServerSecret(),
          account_id: identity.account_id,
          task_id: id as Id<"tasks">,
          actor: identity.agent_id,
        },
      );
      return jsonOk(result);
    }
    const result = await convex().mutation(
      api.auctionSelection.chooseTopBidForAccount,
      {
        server_secret: paymentServerSecret(),
        account_id: identity.account_id,
        task_id: id as Id<"tasks">,
        bid_id: body.bid_id as Id<"bids">,
        actor: identity.agent_id,
      },
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
