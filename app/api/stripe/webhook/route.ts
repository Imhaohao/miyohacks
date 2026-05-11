import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import Stripe from "stripe";
import { api } from "@/convex/_generated/api";
import { centsToAmount } from "@/lib/payments";
import {
  getStripe,
  paymentServerSecret,
  stripeWebhookSecret,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function onboardingStatus(account: Stripe.Account) {
  if (account.payouts_enabled) return "complete" as const;
  const due = account.requirements?.currently_due ?? [];
  return due.length > 0 ? ("restricted" as const) : ("pending" as const);
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const buyerId = session.metadata?.buyer_id;
  const credits = Number(session.metadata?.credits);
  if (!buyerId || !Number.isFinite(credits)) {
    throw new Error("checkout session missing buyer_id or credits metadata");
  }
  await convex().mutation(api.payments.fulfillCheckoutSession, {
    server_secret: paymentServerSecret(),
    buyer_id: buyerId,
    session_id: session.id,
    amount_usd: centsToAmount(session.amount_total ?? 0),
    credits,
    stripe_event_id: event.id,
    stripe_customer_id:
      typeof session.customer === "string" ? session.customer : undefined,
  });
}

async function handleCheckoutExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  await convex().mutation(api.payments.updateCheckoutSessionStatus, {
    server_secret: paymentServerSecret(),
    session_id: session.id,
    status: "expired",
  });
}

async function handleAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;
  const agentId = account.metadata?.agent_id;
  if (!agentId) return;
  await convex().mutation(api.payments.upsertPayoutAccount, {
    server_secret: paymentServerSecret(),
    agent_id: agentId,
    stripe_connect_account_id: account.id,
    onboarding_status: onboardingStatus(account),
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    requirements_due: account.requirements?.currently_due ?? [],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      stripeWebhookSecret(),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid signature" },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event);
      break;
    case "checkout.session.expired":
      await handleCheckoutExpired(event);
      break;
    case "account.updated":
      await handleAccountUpdated(event);
      break;
  }

  return NextResponse.json({ received: true });
}
