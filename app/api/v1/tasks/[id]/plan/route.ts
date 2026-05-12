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
  let body: {
    action?: "approve" | "request_revision" | "cancel";
    feedback?: string;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (!body.action) return jsonError("action is required", 400);

  try {
    const identity = await resolveApiIdentity(req);
    if (!identity) return jsonError("unauthorized", 401);
    const common = {
      server_secret: paymentServerSecret(),
      account_id: identity.account_id,
      task_id: id as Id<"tasks">,
      actor: identity.agent_id,
    };
    const client = convex();
    if (body.action === "approve") {
      return jsonOk(await client.mutation(api.executionPlans.approve, common));
    }
    if (body.action === "request_revision") {
      if (!body.feedback?.trim()) {
        return jsonError("feedback is required", 400);
      }
      return jsonOk(
        await client.mutation(api.executionPlans.requestRevision, {
          ...common,
          feedback: body.feedback,
        }),
      );
    }
    if (body.action === "cancel") {
      return jsonOk(
        await client.mutation(api.executionPlans.cancel, {
          ...common,
          reason: body.reason,
        }),
      );
    }
    return jsonError("unsupported action", 400);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
