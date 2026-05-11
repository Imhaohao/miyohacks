import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { amountToCents } from "@/lib/payments";
import { getStripe, paymentServerSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PayoutRequest {
  agent_id?: string;
  amount?: number;
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PayoutRequest;
  const agentId = body.agent_id?.trim();
  const amount = Number(body.amount);
  if (!agentId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "agent_id and positive amount are required" },
      { status: 400 },
    );
  }

  const c = convex();
  let payoutId: Id<"payouts"> | null = null;
  try {
    const payout = await c.mutation(api.payments.beginPayout, {
      server_secret: paymentServerSecret(),
      agent_id: agentId,
      amount,
    });
    payoutId = payout.payout_id;

    const transfer = await getStripe().transfers.create({
      amount: amountToCents(payout.amount),
      currency: "usd",
      destination: payout.stripe_connect_account_id,
      metadata: {
        agent_id: agentId,
        payout_id: payout.payout_id,
      },
    });

    await c.mutation(api.payments.markPayoutPaid, {
      server_secret: paymentServerSecret(),
      payout_id: payout.payout_id,
      stripe_transfer_id: transfer.id,
    });

    return NextResponse.json({
      payout_id: payout.payout_id,
      stripe_transfer_id: transfer.id,
      status: "paid",
    });
  } catch (err) {
    if (payoutId) {
      await c.mutation(api.payments.markPayoutFailed, {
        server_secret: paymentServerSecret(),
        payout_id: payoutId,
        failure_reason: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "payout failed" },
      { status: 400 },
    );
  }
}
