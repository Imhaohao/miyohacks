import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import Stripe from "stripe";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ARBOR_TASK_FUNDING_PRODUCT, creditsToUsd } from "@/lib/payments";
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

async function handleCreditCheckoutCompleted(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
) {
  const buyerId = session.metadata?.account_id ?? session.metadata?.buyer_id;
  const credits = Number(session.metadata?.credits);
  if (!buyerId || !Number.isFinite(credits)) {
    throw new Error("checkout session missing buyer_id or credits metadata");
  }
  // `session.amount_total` is Stripe integer cents. Credits map 1:1 to cents,
  // so this is exactly the number of credits the buyer paid for. We keep
  // `amount_usd` on the session row for human-readable receipts (in dollars).
  const stripeCents = session.amount_total ?? 0;
  await convex().mutation(api.payments.fulfillCheckoutSession, {
    server_secret: paymentServerSecret(),
    buyer_id: buyerId,
    session_id: session.id,
    amount_usd: creditsToUsd(stripeCents),
    credits,
    stripe_event_id: event.id,
    stripe_customer_id:
      typeof session.customer === "string" ? session.customer : undefined,
  });
}

async function handleTaskFundingCompleted(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
) {
  const buyerId = session.metadata?.account_id ?? session.metadata?.buyer_id;
  const rawTaskId = session.metadata?.task_id;
  if (!buyerId || !rawTaskId) {
    throw new Error("task funding session missing buyer_id or task_id");
  }
  const taskId = rawTaskId as Id<"tasks">;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : undefined;
  // Retrieve the payment intent so we can stash the charge id; ignore failures.
  let chargeId: string | undefined;
  if (paymentIntentId) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const latestCharge = pi.latest_charge as Stripe.Charge | string | null;
      if (latestCharge && typeof latestCharge !== "string") {
        chargeId = latestCharge.id;
      } else if (typeof latestCharge === "string") {
        chargeId = latestCharge;
      }
    } catch {
      // best-effort
    }
  }

  const c = convex();
  // `session.amount_total` is Stripe integer cents — the same integer as the
  // task's credit-denominated `max_budget`. We send credits straight into
  // Convex; nothing in the system stores a decimal-USD amount anymore.
  const grossCredits = session.amount_total ?? 0;
  await c.mutation(api.payments.fulfillTaskFunding, {
    server_secret: paymentServerSecret(),
    task_id: taskId,
    buyer_id: buyerId,
    stripe_event_id: event.id,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: chargeId,
    gross_credits: grossCredits,
  });
  await c.mutation(api.tasks.startAuctionAfterFunding, {
    server_secret: paymentServerSecret(),
    task_id: taskId,
  });
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const product = session.metadata?.product;
  if (product === ARBOR_TASK_FUNDING_PRODUCT) {
    await handleTaskFundingCompleted(event, session);
    return;
  }
  await handleCreditCheckoutCompleted(event, session);
}

async function handleCheckoutExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  await convex()
    .mutation(api.payments.updateCheckoutSessionStatus, {
      server_secret: paymentServerSecret(),
      session_id: session.id,
      status: "expired",
    })
    .catch(() => undefined);
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

async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : undefined;
  if (!paymentIntentId) return;
  // Only flag the incident path when there is already a transfer recorded for
  // the task — the partial refund of unused budget runs server-side and uses
  // its own refund id, so we don't want to double-record those.
  await convex()
    .mutation(api.payments.recordTaskIncident, {
      server_secret: paymentServerSecret(),
      stripe_payment_intent_id: paymentIntentId,
      incident_kind: "refund_after_transfer",
      incident_message: `Charge ${charge.id} refunded $${creditsToUsd(
        charge.amount_refunded ?? 0,
      ).toFixed(2)} (status: ${charge.refunded ? "fully refunded" : "partial"}).`,
    })
    .catch(() => undefined);
}

async function handleChargeDispute(event: Stripe.Event) {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : undefined;
  if (!paymentIntentId) return;
  await convex()
    .mutation(api.payments.recordTaskIncident, {
      server_secret: paymentServerSecret(),
      stripe_payment_intent_id: paymentIntentId,
      incident_kind: "dispute_after_transfer",
      incident_message: `Dispute ${dispute.id} opened (reason: ${dispute.reason}, amount: $${creditsToUsd(
        dispute.amount,
      ).toFixed(2)}).`,
    })
    .catch(() => undefined);
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
    case "charge.refunded":
      await handleChargeRefunded(event);
      break;
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
      await handleChargeDispute(event);
      break;
  }

  return NextResponse.json({ received: true });
}
