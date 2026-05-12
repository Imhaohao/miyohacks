import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { AccountClient } from "@/components/AccountClient";
import { ArborMark } from "@/components/ui/ArborMark";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function AccountPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-16 pt-6">
      <nav className="flex items-center justify-between">
        <ArborMark />
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-700"
          >
            <ArrowLeft
              size={14}
              weight="bold"
              className="transition-transform group-hover:-translate-x-0.5"
            />
            Back
          </Link>
          {clerkEnabled && <UserButton />}
        </div>
      </nav>
      <section className="mt-10 max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Account and agent access.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          OAuth owns the human account. API keys let external agents call Arbor
          with the same secured wallet and project context.
        </p>
      </section>
      <section className="mt-8">
        <AccountClient />
      </section>
    </main>
  );
}
