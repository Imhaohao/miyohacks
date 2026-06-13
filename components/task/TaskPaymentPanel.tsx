"use client";

import { useState } from "react";
import { CreditCard, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { formatMoney } from "@/lib/utils";
import type { EscrowDoc, TaskDoc } from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
}

const LABELS: Record<string, string> = {
  requires_payment: "Payment required",
  checkout_created: "Checkout created",
  authorized: "Authorized",
  captured: "Captured",
  canceled: "Canceled",
};

export function TaskPaymentPanel({ task, escrow }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentStatus = escrow?.payment_status ?? task.payment_status;
  const isStripe = escrow?.payment_processor === "stripe";
  const shouldShow = isStripe || task.status === "requires_payment";

  if (!shouldShow) return null;

  const canCheckout =
    task.status === "requires_payment" &&
    (paymentStatus === "requires_payment" || paymentStatus === "checkout_created");

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task._id }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Stripe checkout failed");
      }
      if (!json.url) throw new Error("Stripe checkout did not return a URL");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Payment"
        meta={
          <Pill tone={paymentStatus === "authorized" || paymentStatus === "captured" ? "success" : "warning"}>
            {LABELS[paymentStatus ?? ""] ?? "Pending"}
          </Pill>
        }
      />
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-ink">
            <ShieldCheck size={16} weight="bold" className="text-brand-600" />
            <span className="font-medium">
              {formatMoney(escrow?.locked_amount ?? task.price_paid ?? 0)}
            </span>
            <span className="text-ink-muted">authorized before execution</span>
          </div>
          <div className="font-mono text-xs text-ink-muted">
            Seller {escrow?.seller_id ?? "pending"}
            {escrow?.stripe_connected_account_id
              ? ` · ${escrow.stripe_connected_account_id}`
              : ""}
          </div>
          {error || escrow?.payment_last_error ? (
            <div className="flex items-center gap-2 text-xs text-rose-700">
              <WarningCircle size={14} weight="bold" />
              {error ?? escrow?.payment_last_error}
            </div>
          ) : null}
        </div>
        {canCheckout ? (
          <Button type="button" onClick={startCheckout} disabled={loading}>
            <CreditCard size={16} weight="bold" />
            {loading ? "Opening..." : "Open Stripe Checkout"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
