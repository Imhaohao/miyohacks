import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  getStripe,
  requireStripeCheckoutEnabled,
  stripeCheckoutEnabled,
  stripeBridgeSecret,
  stripeWebhookSecret,
} from "@/lib/stripe/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function latestChargeId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function taskIdFromMetadata(metadata: Stripe.Metadata | null | undefined) {
  const taskId = metadata?.arbor_task_id;
  return taskId ? (taskId as Id<"tasks">) : null;
}

function requirementList(account: { requirements?: { currently_due?: string[] | null } }) {
  return account.requirements?.currently_due ?? [];
}

async function recordConnectedAccount(account: Stripe.Account) {
  const agentId = account.metadata?.arbor_agent_id;
  if (!agentId) return;
  await convex().mutation(api.payments.upsertStripeAccount, {
    bridge_secret: stripeBridgeSecret(),
    agent_id: agentId,
    stripe_account_id: account.id,
    email: account.email ?? undefined,
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    details_submitted: Boolean(account.details_submitted),
    requirements_currently_due: requirementList(account),
  });
}

async function recordPaymentIntent(
  intent: Stripe.PaymentIntent,
  checkoutSessionId?: string,
) {
  const task_id = taskIdFromMetadata(intent.metadata);
  if (!task_id) return;
  const client = convex();
  const bridge_secret = stripeBridgeSecret();
  if (intent.status === "requires_capture") {
    await client.mutation(api.payments.markStripeAuthorized, {
      bridge_secret,
      task_id,
      stripe_payment_intent_id: intent.id,
      stripe_checkout_session_id: checkoutSessionId,
      stripe_charge_id: latestChargeId(intent.latest_charge),
    });
    return;
  }
  if (intent.status === "succeeded") {
    await client.mutation(api.payments.markStripeCaptured, {
      bridge_secret,
      task_id,
      stripe_payment_intent_id: intent.id,
      stripe_charge_id: latestChargeId(intent.latest_charge),
    });
    return;
  }
  if (intent.status === "canceled") {
    await client.mutation(api.payments.markStripeCanceled, {
      bridge_secret,
      task_id,
      stripe_payment_intent_id: intent.id,
      reason: intent.cancellation_reason ?? "stripe_payment_intent_canceled",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!stripeCheckoutEnabled()) {
      return NextResponse.json(
        {
          error:
            "Stripe checkout is disabled. Set ARBOR_PAYMENTS_MODE=stripe_checkout to enable real payment side effects.",
          code: "stripe_disabled",
        },
        { status: 503 },
      );
    }
    requireStripeCheckoutEnabled();
    const stripe = getStripe();
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "missing stripe-signature" }, { status: 400 });
    }
    const rawBody = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        stripeWebhookSecret(),
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        if (paymentIntentId) {
          const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
          await recordPaymentIntent(intent, session.id);
        }
        break;
      }
      case "account.updated":
        await recordConnectedAccount(event.data.object as Stripe.Account);
        break;
      case "payment_intent.amount_capturable_updated":
      case "payment_intent.succeeded":
      case "payment_intent.canceled":
        await recordPaymentIntent(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
