/**
 * POST /api/stripe/checkout/task
 *
 * Live-money task funding. Creates a task in `checkout_pending` and a Stripe
 * Checkout Session whose metadata + transfer_group bind the payment to the
 * task. The signed `checkout.session.completed` webhook flips the task to
 * `live_funded` and starts the auction — there is no client-trusted "fund"
 * path.
 */

import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { currentClerkAccount } from "@/lib/clerk-account";
import { publicBaseUrl } from "@/lib/http";
import {
  creditsToUsd,
  taskFundingCheckoutMetadata,
  taskTransferGroup,
  usdToCredits,
} from "@/lib/payments";
import { getStripe, paymentServerSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TaskCheckoutRequest {
  prompt: string;
  max_budget: number;
  project_id?: string;
  task_type?: string;
  target_repo?: string;
  target_branch?: string;
  output_schema?: Record<string, unknown>;
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

  let body: TaskCheckoutRequest;
  try {
    body = (await req.json()) as TaskCheckoutRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt_required" }, { status: 400 });
  }
  // The buyer form sends `max_budget` as decimal USD ($2.00). We convert at
  // this boundary into integer credits (200) for the rest of the system —
  // wire format, Convex storage, and Stripe `unit_amount` are all the same
  // integer from here on.
  const maxBudgetUsd = Number(body.max_budget);
  if (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0) {
    return NextResponse.json({ error: "max_budget_required" }, { status: 400 });
  }
  const maxBudgetCredits = usdToCredits(maxBudgetUsd);
  if (maxBudgetCredits < 50) {
    // Stripe rejects line items under $0.50 USD (50 cents = 50 credits).
    return NextResponse.json(
      { error: "max_budget_below_minimum", min_usd: 0.5 },
      { status: 400 },
    );
  }

  const c = convex();
  await c.mutation(api.accounts.ensureByClerkUser, {
    server_secret: paymentServerSecret(),
    clerk_user_id: account.clerk_user_id,
    email: account.email,
    display_name: account.display_name,
    avatar_url: account.avatar_url,
  });

  const { task_id } = await c.mutation(api.tasks.postLivePending, {
    server_secret: paymentServerSecret(),
    account_id: account.account_id,
    project_id: (body.project_id as Id<"projects"> | undefined) ?? undefined,
    task_type: body.task_type,
    prompt: body.prompt,
    max_budget: maxBudgetCredits,
    output_schema: body.output_schema,
    target_repo: body.target_repo,
    target_branch: body.target_branch,
  });

  const transferGroup = taskTransferGroup(String(task_id));
  const metadata = taskFundingCheckoutMetadata({
    buyerId: account.account_id,
    clerkUserId: account.clerk_user_id,
    taskId: String(task_id),
    maxBudget: maxBudgetUsd, // metadata stays in USD for human-readable Stripe receipts
    transferGroup,
    projectId: body.project_id,
    taskType: body.task_type,
  });

  const baseUrl = publicBaseUrl(req);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_creation: "always",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          // 1 credit == 1 cent, so the Stripe unit_amount is the same integer.
          unit_amount: maxBudgetCredits,
          product_data: {
            name: `Arbor task budget · $${maxBudgetUsd.toFixed(2)}`,
            description:
              "Funds escrow for an Arbor specialist auction. Unused budget is partially refunded once the winner is chosen.",
          },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      metadata,
      transfer_group: transferGroup,
    },
    success_url: `${baseUrl}/task/${task_id}?funded=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/task/${task_id}?funded=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "stripe_session_missing_url" },
      { status: 502 },
    );
  }

  await c.mutation(api.payments.recordTaskCheckoutCreated, {
    server_secret: paymentServerSecret(),
    task_id,
    buyer_id: account.account_id,
    max_budget: maxBudgetCredits,
    stripe_session_id: session.id,
    transfer_group: transferGroup,
  });

  return NextResponse.json({
    task_id,
    checkout_url: session.url,
    session_id: session.id,
    max_budget_credits: maxBudgetCredits,
    max_budget_usd: creditsToUsd(maxBudgetCredits),
    transfer_group: transferGroup,
  });
}
