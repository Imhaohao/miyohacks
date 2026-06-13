import { ConvexHttpClient } from "convex/browser";
import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { corsPreflight, jsonError, jsonOk, publicBaseUrl } from "@/lib/http";
import {
  amountToMinorUnits,
  getStripe,
  platformFeeAmount,
  requireStripeCheckoutEnabled,
  stripeBridgeSecret,
  stripeCheckoutEnabled,
  stripeCurrency,
} from "@/lib/stripe/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function paymentIntentId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
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
    requireStripeCheckoutEnabled();
    const body = (await req.json()) as { task_id?: string };
    const taskId = body.task_id?.trim();
    if (!taskId) return jsonError("task_id is required", 400);
    const task_id = taskId as Id<"tasks">;

    const client = convex();
    const [task, escrow] = await Promise.all([
      client.query(api.tasks.get, { task_id }),
      client.query(api.escrow.forTask, { task_id }),
    ]);
    if (!task) return jsonError("task not found", 404);
    if (!escrow) return jsonError("escrow not found for task", 409);
    if (escrow.status !== "locked") {
      return jsonError(`escrow is ${escrow.status}, not locked`, 409);
    }
    if (task.status !== "requires_payment" && task.payment_status !== "requires_payment") {
      return jsonError("task is not waiting for Stripe payment", 409);
    }

    const account = await client.query(api.payments.stripeAccountForAgent, {
      agent_id: escrow.seller_id,
    });
    if (!account?.stripe_account_id) {
      return jsonError(
        `seller ${escrow.seller_id} has no Stripe connected account`,
        409,
        "stripe_seller_not_onboarded",
      );
    }
    if (!account.charges_enabled || !account.payouts_enabled) {
      return jsonError(
        `seller ${escrow.seller_id} has not completed Stripe onboarding`,
        409,
        "stripe_seller_not_ready",
      );
    }

    const stripe = getStripe();
    const currency = stripeCurrency();
    const amount = amountToMinorUnits(escrow.locked_amount);
    const applicationFeeAmount = platformFeeAmount(amount);
    const baseUrl = publicBaseUrl(req);
    const metadata = {
      arbor_task_id: taskId,
      arbor_escrow_id: escrow._id,
      arbor_seller_id: escrow.seller_id,
      arbor_buyer_id: escrow.buyer_id,
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: amount,
              product_data: {
                name: `Arbor task ${taskId}`,
                description: task.prompt.slice(0, 240),
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/task/${encodeURIComponent(taskId)}?stripe_checkout=success`,
        cancel_url: `${baseUrl}/task/${encodeURIComponent(taskId)}?stripe_checkout=cancel`,
        metadata,
        payment_intent_data: {
          capture_method: "manual",
          ...(applicationFeeAmount > 0
            ? { application_fee_amount: applicationFeeAmount }
            : {}),
          transfer_data: {
            destination: account.stripe_account_id,
          },
          metadata,
        },
      },
      {
        idempotencyKey: `arbor_checkout_${escrow._id}_${amount}`,
      },
    );

    await client.mutation(api.payments.attachStripeCheckout, {
      bridge_secret: stripeBridgeSecret(),
      task_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId(session.payment_intent),
      stripe_connected_account_id: account.stripe_account_id,
      stripe_application_fee_amount: applicationFeeAmount,
      stripe_currency: currency,
    });

    return jsonOk({
      checkout_session_id: session.id,
      url: session.url,
      amount,
      currency,
      application_fee_amount: applicationFeeAmount,
      stripe_connected_account_id: account.stripe_account_id,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
