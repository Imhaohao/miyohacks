import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { corsPreflight, jsonError, jsonOk, publicBaseUrl } from "@/lib/http";
import {
  getStripe,
  requireStripeCheckoutEnabled,
  stripeCheckoutEnabled,
  stripeBridgeSecret,
  stripeBusinessProfileUrl,
  stripeConnectCountry,
  stripeProductDescription,
} from "@/lib/stripe/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function requirementList(account: { requirements?: { currently_due?: string[] | null } }) {
  return account.requirements?.currently_due ?? [];
}

async function createOrRefreshOnboardingLink({
  req,
  agentId,
  email,
}: {
  req: NextRequest;
  agentId: string;
  email?: string;
}) {
  requireStripeCheckoutEnabled();
  const stripe = getStripe();
  const client = convex();
  const existing = await client.query(api.payments.stripeAccountForAgent, {
    agent_id: agentId,
  });

  const account = existing?.stripe_account_id
    ? await stripe.accounts.retrieve(existing.stripe_account_id)
    : await stripe.accounts.create({
        type: "express",
        country: stripeConnectCountry(),
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          url: stripeBusinessProfileUrl(),
          product_description: stripeProductDescription(),
        },
        metadata: { arbor_agent_id: agentId },
      });

  await client.mutation(api.payments.upsertStripeAccount, {
    bridge_secret: stripeBridgeSecret(),
    agent_id: agentId,
    stripe_account_id: account.id,
    email: email ?? account.email ?? undefined,
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    details_submitted: Boolean(account.details_submitted),
    requirements_currently_due: requirementList(account),
  });

  const baseUrl = publicBaseUrl(req);
  const link = await stripe.accountLinks.create({
    account: account.id,
    type: "account_onboarding",
    refresh_url: `${baseUrl}/api/stripe/connect/onboard?agent_id=${encodeURIComponent(agentId)}`,
    return_url: `${baseUrl}/agents?stripe_onboarding=returned&agent_id=${encodeURIComponent(agentId)}`,
    collection_options: {
      fields: "eventually_due",
      future_requirements: "include",
    },
  });

  return {
    account,
    onboarding_url: link.url,
    expires_at: link.expires_at,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!stripeCheckoutEnabled()) {
      return jsonError(
        "Stripe checkout is disabled. Set ARBOR_PAYMENTS_MODE=stripe_checkout to enable real payment side effects.",
        503,
        "stripe_disabled",
      );
    }
    const body = (await req.json()) as { agent_id?: string; email?: string };
    const agentId = body.agent_id?.trim();
    if (!agentId) return jsonError("agent_id is required", 400);
    const result = await createOrRefreshOnboardingLink({
      req,
      agentId,
      email: body.email?.trim() || undefined,
    });
    return jsonOk({
      agent_id: agentId,
      stripe_account_id: result.account.id,
      onboarding_url: result.onboarding_url,
      expires_at: result.expires_at,
      charges_enabled: result.account.charges_enabled,
      payouts_enabled: result.account.payouts_enabled,
      details_submitted: result.account.details_submitted,
      requirements_currently_due: requirementList(result.account),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!stripeCheckoutEnabled()) {
      return jsonError(
        "Stripe checkout is disabled. Set ARBOR_PAYMENTS_MODE=stripe_checkout to enable real payment side effects.",
        503,
        "stripe_disabled",
      );
    }
    const agentId = new URL(req.url).searchParams.get("agent_id")?.trim();
    if (!agentId) return jsonError("agent_id is required", 400);
    const result = await createOrRefreshOnboardingLink({ req, agentId });
    return NextResponse.redirect(result.onboarding_url, 303);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
