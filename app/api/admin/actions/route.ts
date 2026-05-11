import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  adminSecret,
  convexAdmin,
  logAdminEvent,
  requireAdminRequest,
} from "@/lib/admin-api";
import type { AdminActionRequest } from "@/lib/admin-types";
import { amountToCents } from "@/lib/payments";
import { getStripe, paymentServerSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function connectStatus(account: Stripe.Account) {
  if (account.payouts_enabled) return "complete" as const;
  return (account.requirements?.currently_due ?? []).length > 0
    ? ("restricted" as const)
    : ("pending" as const);
}

async function refreshConnectAccount(actor: string, agentId: string, reason: string) {
  const c = convexAdmin();
  const existing = await c.query(api.payments.payoutAccountForAgent, {
    agent_id: agentId,
  });
  if (!existing) throw new Error("agent has no Stripe Connect account");
  const account = await getStripe().accounts.retrieve(
    existing.stripe_connect_account_id,
  );
  await c.mutation(api.payments.upsertPayoutAccount, {
    server_secret: paymentServerSecret(),
    agent_id: agentId,
    stripe_connect_account_id: account.id,
    onboarding_status: connectStatus(account),
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    requirements_due: account.requirements?.currently_due ?? [],
  });
  await logAdminEvent({
    actor,
    action: "refresh_connect_account",
    target_type: "agent",
    target_id: agentId,
    reason,
    payload: {
      stripe_connect_account_id: account.id,
      payouts_enabled: Boolean(account.payouts_enabled),
    },
  });
  return { ok: true, payouts_enabled: Boolean(account.payouts_enabled) };
}

async function retryPayout(actor: string, payoutId: Id<"payouts">, reason: string) {
  const c = convexAdmin();
  const ready = await c.action(api.admin.retryPayout, {
    admin_secret: adminSecret(),
    actor,
    payout_id: payoutId,
    reason,
  });
  const payout = await c.mutation(api.payments.beginPayout, {
    server_secret: paymentServerSecret(),
    agent_id: ready.agent_id,
    amount: ready.amount,
  });
  try {
    const transfer = await getStripe().transfers.create({
      amount: amountToCents(payout.amount),
      currency: "usd",
      destination: payout.stripe_connect_account_id,
      metadata: {
        agent_id: ready.agent_id,
        payout_id: payout.payout_id,
        retried_from_payout_id: payoutId,
      },
    });
    await c.mutation(api.payments.markPayoutPaid, {
      server_secret: paymentServerSecret(),
      payout_id: payout.payout_id,
      stripe_transfer_id: transfer.id,
    });
    return {
      ok: true,
      status: "paid",
      payout_id: payout.payout_id,
      stripe_transfer_id: transfer.id,
    };
  } catch (err) {
    await c.mutation(api.payments.markPayoutFailed, {
      server_secret: paymentServerSecret(),
      payout_id: payout.payout_id,
      failure_reason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const admin = requireAdminRequest(req);
  if (!admin.ok) return admin.response;
  const body = (await req.json()) as AdminActionRequest;
  if (!body.reason?.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  if (!body.target_id?.trim()) {
    return NextResponse.json({ error: "target_id is required" }, { status: 400 });
  }

  try {
    if (body.action === "cancel_task") {
      const result = await convexAdmin().action(api.admin.cancelTask, {
        admin_secret: adminSecret(),
        actor: admin.actor,
        task_id: body.target_id as Id<"tasks">,
        reason: body.reason,
      });
      return NextResponse.json(result);
    }
    if (body.action === "override_judge") {
      const verdict = body.payload?.verdict;
      if (verdict !== "accept" && verdict !== "reject") {
        return NextResponse.json(
          { error: "payload.verdict must be accept or reject" },
          { status: 400 },
        );
      }
      const result = await convexAdmin().action(api.admin.overrideJudge, {
        admin_secret: adminSecret(),
        actor: admin.actor,
        task_id: body.target_id as Id<"tasks">,
        verdict,
        reason: body.reason,
      });
      return NextResponse.json(result);
    }
    if (body.action === "refresh_connect_account") {
      return NextResponse.json(
        await refreshConnectAccount(admin.actor, body.target_id, body.reason),
      );
    }
    if (body.action === "retry_payout") {
      return NextResponse.json(
        await retryPayout(admin.actor, body.target_id as Id<"payouts">, body.reason),
      );
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "admin action failed" },
      { status: 400 },
    );
  }
}
