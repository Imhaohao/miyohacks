"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { CREDIT_PACKS, formatCredits } from "@/lib/payments";
import { CURRENT_BUYER_ID } from "@/lib/current-user";
import { formatMoney } from "@/lib/utils";
import {
  ArrowSquareOut,
  Bank,
  CircleNotch,
  CreditCard,
  Wallet,
} from "@phosphor-icons/react";

const BUYER_ID = CURRENT_BUYER_ID;

interface CheckoutResponse {
  url?: string;
  error?: string;
}

export function BillingClient() {
  const wallet = useQuery(api.payments.walletForBuyer, {
    buyer_id: BUYER_ID,
  });
  const ledger = useQuery(api.payments.ledgerForBuyer, {
    buyer_id: BUYER_ID,
    limit: 12,
  }) as Doc<"ledger_entries">[] | undefined;
  const [busyPack, setBusyPack] = useState<number | null>(null);
  const [agentId, setAgentId] = useState("stripe-payments");
  const agentWallet = useQuery(api.payments.agentWallet, {
    agent_id: agentId || "stripe-payments",
  });
  const payoutAccount = useQuery(api.payments.payoutAccountForAgent, {
    agent_id: agentId || "stripe-payments",
  });
  const [payoutAmount, setPayoutAmount] = useState("1.00");
  const [agentBusy, setAgentBusy] = useState<"connect" | "payout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const balance = wallet?.available_credits ?? 0;
  const reserved = wallet?.reserved_credits ?? 0;

  async function buyCredits(credits: number) {
    setBusyPack(credits);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_id: BUYER_ID, credits }),
      });
      const json = (await res.json()) as CheckoutResponse;
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Unable to create checkout session");
      }
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusyPack(null);
    }
  }

  async function connectAgent() {
    setAgentBusy("connect");
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const json = (await res.json()) as CheckoutResponse;
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Unable to create onboarding link");
      }
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAgentBusy(null);
    }
  }

  async function requestPayout() {
    setAgentBusy("payout");
    setError(null);
    try {
      const res = await fetch("/api/stripe/payouts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          amount: Number(payoutAmount),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Payout failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentBusy(null);
    }
  }

  const payoutReady = Boolean(payoutAccount?.payouts_enabled);
  const latestLedger = useMemo(() => ledger ?? [], [ledger]);

  return (
    <div className="space-y-5">
      <Card className="animate-fade-up">
        <CardHeader
          title="Credits wallet"
          meta={<Pill tone="brand">Stripe funded</Pill>}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            icon={<Wallet size={18} weight="bold" />}
            label="Available"
            value={formatCredits(balance)}
          />
          <Metric
            icon={<CreditCard size={18} weight="bold" />}
            label="Reserved in auctions"
            value={formatCredits(reserved)}
          />
          <Metric
            icon={<Bank size={18} weight="bold" />}
            label="Lifetime spent"
            value={formatCredits(wallet?.lifetime_spent ?? 0)}
          />
        </div>
      </Card>

      <Card className="animate-fade-up [animation-delay:60ms]">
        <CardHeader
          title="Buy credits"
          meta="Webhook confirmation credits the wallet"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.credits}
              className="rounded-xl bg-surface-subtle p-4"
            >
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">
                {pack.label}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold text-ink">
                {formatCredits(pack.credits)}
              </div>
              <div className="mt-1 text-sm text-ink-muted">
                {formatMoney(pack.amountUsd)}
              </div>
              <Button
                type="button"
                className="mt-4 w-full"
                size="sm"
                onClick={() => buyCredits(pack.credits)}
                disabled={busyPack !== null}
              >
                {busyPack === pack.credits ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <CreditCard size={14} weight="bold" />
                )}
                Checkout
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="animate-fade-up [animation-delay:120ms]">
        <CardHeader
          title="Agent payout rail"
          meta={
            <Pill tone={payoutReady ? "success" : "warning"}>
              {payoutReady ? "Payout ready" : "Connect required"}
            </Pill>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">
              Agent ID
            </label>
            <input
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm text-ink focus:border-brand-600 focus:outline-none focus:shadow-ring"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Available earnings"
                value={formatCredits(agentWallet?.available_earnings ?? 0)}
              />
              <Metric
                label="Lifetime paid out"
                value={formatCredits(agentWallet?.lifetime_paid_out ?? 0)}
              />
            </div>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">
              Payout amount
            </label>
            <input
              value={payoutAmount}
              onChange={(event) => setPayoutAmount(event.target.value)}
              type="number"
              min="0.01"
              step="0.01"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm text-ink focus:border-brand-600 focus:outline-none focus:shadow-ring"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={connectAgent}
                disabled={!agentId.trim() || agentBusy !== null}
              >
                {agentBusy === "connect" ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <ArrowSquareOut size={14} weight="bold" />
                )}
                Connect Stripe
              </Button>
              <Button
                type="button"
                onClick={requestPayout}
                disabled={!payoutReady || agentBusy !== null}
              >
                {agentBusy === "payout" ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <Bank size={14} weight="bold" />
                )}
                Pay agent
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="animate-fade-up [animation-delay:180ms]">
        <CardHeader title="Ledger" meta="Recent buyer entries" />
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {latestLedger.length === 0 ? (
            <div className="p-4 text-sm text-ink-muted">
              No ledger entries yet.
            </div>
          ) : (
            latestLedger.map((entry) => (
              <div
                key={entry._id}
                className="grid grid-cols-[1fr_auto] gap-3 bg-white p-3 text-sm"
              >
                <div>
                  <div className="font-medium text-ink">
                    {entry.entry_type.replaceAll("_", " ")}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-ink-muted">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
                <div
                  className={
                    entry.amount >= 0
                      ? "font-mono font-semibold text-emerald-600"
                      : "font-mono font-semibold text-rose-600"
                  }
                >
                  {entry.amount >= 0 ? "+" : ""}
                  {entry.amount.toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-surface-subtle p-4">
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-lg font-semibold tracking-tight text-ink">
        {value}
      </div>
    </div>
  );
}
