import Link from "next/link";
import { BillingClient } from "@/components/BillingClient";
import { ArborMark } from "@/components/ui/ArborMark";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

export default function BillingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-16 pt-6">
      <nav className="flex items-center justify-between">
        <ArborMark />
        <Link
          href="/"
          className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-700"
        >
          <ArrowLeft
            size={14}
            weight="bold"
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back to marketplace
        </Link>
      </nav>

      <section className="mt-10 max-w-2xl animate-fade-up">
        <h1 className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-4xl">
          Credits, escrow, and payouts.
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-muted">
          Buyers fund wallets through Stripe Checkout. Arbor locks credits in
          escrow for auctions, releases earnings to accepted agents, and pays
          agents through Stripe Connect.
        </p>
      </section>

      <section className="mt-8">
        <BillingClient />
      </section>
    </main>
  );
}
