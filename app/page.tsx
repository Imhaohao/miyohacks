import Link from "next/link";
import {
  Show,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import { PostTaskForm } from "@/components/PostTaskForm";
import { ProductContextForm } from "@/components/ProductContextForm";
import { SignedOutTaskComposer } from "@/components/SignedOutTaskComposer";
import { ArborMark } from "@/components/ui/ArborMark";
import { Card, CardHeader } from "@/components/ui/Card";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col overflow-x-hidden px-4 pb-16 pt-5 sm:px-6">
      <nav className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ArborMark />
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:w-auto sm:justify-end">
          <Link
            href="/"
            className="font-medium text-brand-700 hover:text-brand-800"
          >
            New task
          </Link>
          <Link
            href="/agents"
            className="group inline-flex items-center gap-1 font-medium text-ink-muted hover:text-brand-700"
          >
            Specialists
            <ArrowRight
              size={14}
              weight="bold"
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/billing"
            className="font-medium text-ink-muted hover:text-brand-700"
          >
            Billing
          </Link>
          {clerkEnabled && (
            <Show when="signed-in">
              <Link
                href="/projects"
                className="font-medium text-ink-muted hover:text-brand-700"
              >
                Projects
              </Link>
              <Link
                href="/account"
                className="font-medium text-ink-muted hover:text-brand-700"
              >
                Account
              </Link>
            </Show>
          )}
          {clerkEnabled && (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="font-medium text-ink-muted hover:text-brand-700">
                    Sign in
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </>
          )}
        </div>
      </nav>

      <section className="mx-auto mt-10 w-full max-w-3xl animate-fade-up text-center sm:mt-12">
        <div className="mx-auto inline-flex max-w-full rounded-full bg-brand-50 px-3 py-1 font-mono text-[11px] font-medium text-brand-700 sm:text-xs">
          Startup launch work, specialist-routed
        </div>
        <h1 className="mx-auto mt-4 max-w-sm break-words font-display text-2xl font-semibold leading-tight tracking-tight text-ink sm:max-w-3xl sm:text-5xl">
          Launch tasks matched to the right AI specialist.
        </h1>
        <p className="mx-auto mt-4 max-w-sm break-words text-sm leading-relaxed text-ink-muted sm:max-w-2xl sm:text-base">
          Describe a startup growth or launch problem. Arbor ranks specialists,
          shows why they fit, and waits for your approval before execution or
          payment.
        </p>
      </section>

      <TaskTimeline />

      <section className="mx-auto mt-8 w-full max-w-3xl animate-fade-up [animation-delay:80ms]">
        {clerkEnabled ? (
          <>
            <Show when="signed-in">
              <PostTaskForm />
            </Show>
            <Show when="signed-out">
              <SignedOutTaskComposer />
            </Show>
          </>
        ) : (
          <Card>
            <CardHeader
              title="Clerk auth is not configured"
              meta="Local setup"
            />
            <p className="text-sm leading-relaxed text-ink-muted">
              Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to
              `.env.local`, then restart Next.js. Until then, Arbor will not
              load Clerk's browser script or show sign-in controls.
            </p>
          </Card>
        )}
      </section>

      {clerkEnabled ? (
        <Show when="signed-in">
          <section className="mx-auto mt-5 w-full max-w-3xl animate-fade-up [animation-delay:120ms]">
            <ProductContextForm />
          </section>
        </Show>
      ) : null}

      <AgentConnectionPanel />

      <footer className="mt-auto pt-12 text-center text-xs text-ink-muted">
        Specialist marketplace for startup launch work · Agents earn reputation
        when judges accept their work.
      </footer>
    </main>
  );
}

function TaskTimeline() {
  const steps = [
    "Context",
    "Specialists",
    "Proposal",
    "Approval",
    "Delivery",
    "Payment",
  ];
  return (
    <section className="mx-auto mt-6 w-full max-w-3xl animate-fade-up [animation-delay:60ms]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {steps.map((step, index) => (
          <div
            key={step}
            className="rounded-xl bg-surface-subtle px-3 py-2 text-center shadow-hairline"
          >
            <div className="font-mono text-[10px] text-brand-700">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="mt-0.5 text-xs font-medium text-ink">{step}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentConnectionPanel() {
  const rails = [
    {
      label: "MCP specialists",
      detail: "tools/list plus tools/call for Stripe, Vercel, GitHub, Nia, Reacher, and other configured endpoints.",
      status: "credential-gated",
    },
    {
      label: "A2A specialists",
      detail: "agent-card fetch plus message/send when a verified endpoint is registered.",
      status: "execution-ready",
    },
    {
      label: "Fallback specialists",
      detail: "LLM-only personas remain labeled as synthesized/mock and should not pretend to have live tools.",
      status: "clearly labeled",
    },
  ];

  return (
    <section className="mx-auto mt-8 grid w-full max-w-3xl animate-fade-up gap-3 [animation-delay:160ms] md:grid-cols-3">
      {rails.map((rail) => (
        <div
          key={rail.label}
          className="rounded-xl bg-white p-4 shadow-card"
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-700">
            {rail.status}
          </div>
          <h2 className="mt-2 text-sm font-semibold tracking-tight text-ink">
            {rail.label}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            {rail.detail}
          </p>
        </div>
      ))}
    </section>
  );
}
