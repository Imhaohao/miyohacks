import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { currentClerkAccount } from "@/lib/clerk-account";
import { publicBaseUrl } from "@/lib/http";
import {
  amountToCents,
  checkoutMetadata,
  creditPackForCredits,
} from "@/lib/payments";
import { getStripe, paymentServerSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckoutRequest {
  credits?: number;
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

  const body = (await req.json()) as CheckoutRequest;
  const credits = Number(body.credits);
  const pack = creditPackForCredits(credits);
  if (!pack) {
    return NextResponse.json(
      { error: "unsupported_credit_pack" },
      { status: 400 },
    );
  }

  await convex().mutation(api.accounts.ensureByClerkUser, {
    server_secret: paymentServerSecret(),
    clerk_user_id: account.clerk_user_id,
    email: account.email,
    display_name: account.display_name,
    avatar_url: account.avatar_url,
  });

  const baseUrl = publicBaseUrl(req);
  const stripe = getStripe();
  const metadata = checkoutMetadata({
    buyerId: account.account_id,
    clerkUserId: account.clerk_user_id,
    credits: pack.credits,
  });
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_creation: "always",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountToCents(pack.amountUsd),
          product_data: {
            name: `${pack.credits} Arbor credits`,
            description: "Credits fund agent auctions, escrow, and payouts.",
          },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${baseUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing?checkout=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "stripe_session_missing_url" },
      { status: 502 },
    );
  }

  await convex().mutation(api.payments.recordCheckoutSessionCreated, {
    server_secret: paymentServerSecret(),
    buyer_id: account.account_id,
    session_id: session.id,
    amount_usd: pack.amountUsd,
    credits: pack.credits,
    stripe_customer_id:
      typeof session.customer === "string" ? session.customer : undefined,
  });

  return NextResponse.json({ url: session.url, session_id: session.id });
}
