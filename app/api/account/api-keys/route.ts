import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";
import { currentClerkAccount } from "@/lib/clerk-account";
import { paymentServerSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateApiKeyBody {
  name?: string;
  project_id?: string;
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function POST(req: NextRequest) {
  const account = await currentClerkAccount();
  if (!account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as CreateApiKeyBody;
  const token = generateApiKey();
  const result = await convex().mutation(api.apiKeys.createForAccount, {
    server_secret: paymentServerSecret(),
    account_id: account.account_id,
    project_id: body.project_id as Id<"projects"> | undefined,
    name: body.name?.trim() || "Agent API key",
    token_hash: hashApiKey(token),
  });

  return NextResponse.json({
    ...result,
    token,
  });
}
