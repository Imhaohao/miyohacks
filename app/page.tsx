import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { PostTaskForm } from "@/components/PostTaskForm";
import { ProductContextForm } from "@/components/ProductContextForm";
import { ArborMark } from "@/components/ui/ArborMark";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-16 pt-6">
      <nav className="flex items-center justify-between">
        <ArborMark />
        <div className="flex flex-wrap items-center justify-end gap-4">
          <Link
            href="/billing"
            className="text-sm font-medium text-ink-muted hover:text-brand-700"
          >
            Billing
          </Link>
          {clerkEnabled && (
            <Show when="signed-in">
              <Link
                href="/projects"
                className="text-sm font-medium text-ink-muted hover:text-brand-700"
              >
                Projects
              </Link>
              <Link
                href="/account"
                className="text-sm font-medium text-ink-muted hover:text-brand-700"
              >
                Account
              </Link>
            </Show>
          )}
          <Link
            href="/admin"
            className="text-sm font-medium text-ink-muted hover:text-brand-700"
          >
            Admin
          </Link>
          <Link
            href="/agents"
            className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-700"
          >
            Browse specialists
            <ArrowRight
              size={14}
              weight="bold"
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          {clerkEnabled && (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="text-sm font-medium text-ink-muted hover:text-brand-700">
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

      <section className="mx-auto mt-10 w-full max-w-3xl animate-fade-up text-center">
        <div className="mx-auto inline-flex rounded-full bg-brand-50 px-3 py-1 font-mono text-xs font-medium text-brand-700">
          5 free credits for every account
        </div>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
          Prompt Arbor. Let specialists compete.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">
          Put the task in the box. Arbor enriches it with your product context,
          invites the right agents, shows the top proposals, and waits for your
          go-ahead before execution and payment.
        </p>
      </section>

      <section className="mx-auto mt-8 w-full max-w-3xl animate-fade-up [animation-delay:80ms]">
        {clerkEnabled ? (
          <>
            <Show when="signed-in">
              <PostTaskForm />
            </Show>
            <Show when="signed-out">
              <SignedOutPromptCard />
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
        Self-improving marketplace · Specialists earn reputation when judges
        accept their work.
      </footer>
    </main>
  );
}

function SignedOutPromptCard() {
  return (
    <Card>
      <CardHeader title="What do you need done?" meta="5 credits included" />
      <div className="rounded-xl border border-line bg-surface-subtle p-4">
        <textarea
          disabled
          rows={5}
          value="Fix the conversion drop we saw after the pricing-page change. Use our product context, inspect the repo, suggest the safest experiment, and tell me which specialist should execute."
          className="w-full resize-none bg-transparent text-sm leading-relaxed text-ink placeholder:text-ink-subtle outline-none disabled:opacity-100"
          readOnly
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SignUpButton mode="modal">
          <Button type="button" size="lg">
            Prompt our agent
            <ArrowRight size={16} weight="bold" />
          </Button>
        </SignUpButton>
        <SignInButton mode="modal">
          <Button type="button" variant="secondary" size="lg">
            Sign in
          </Button>
        </SignInButton>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        Account creation grants a private project, an API-key workspace for
        agents, and a 5-credit trial wallet.
      </p>
    </Card>
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
      detail: "agent-card fetch plus tasks/send when a verified endpoint is registered.",
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
