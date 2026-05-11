import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { publicBaseUrl } from "@/lib/http";
import { getStripe, paymentServerSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OnboardingRequest {
  agent_id?: string;
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as OnboardingRequest;
  const agentId = body.agent_id?.trim();
  if (!agentId) {
    return NextResponse.json({ error: "agent_id required" }, { status: 400 });
  }

  const stripe = getStripe();
  const c = convex();
  const existing = await c.query(api.payments.payoutAccountForAgent, {
    agent_id: agentId,
  });

  const accountId =
    existing?.stripe_connect_account_id ??
    (
      await stripe.accounts.create({
        type: "express",
        capabilities: {
          transfers: { requested: true },
        },
        metadata: { agent_id: agentId },
      })
    ).id;

  const account = await stripe.accounts.retrieve(accountId);
  await c.mutation(api.payments.upsertPayoutAccount, {
    server_secret: paymentServerSecret(),
    agent_id: agentId,
    stripe_connect_account_id: account.id,
    onboarding_status: account.payouts_enabled
      ? "complete"
      : (account.requirements?.currently_due ?? []).length > 0
        ? "restricted"
        : "pending",
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    requirements_due: account.requirements?.currently_due ?? [],
  });

  const baseUrl = publicBaseUrl(req);
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/billing?connect=refresh&agent_id=${encodeURIComponent(agentId)}`,
    return_url: `${baseUrl}/billing?connect=return&agent_id=${encodeURIComponent(agentId)}`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url, account_id: accountId });
}
