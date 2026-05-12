import { SignUp } from "@clerk/nextjs";
import { ArborMark } from "@/components/ui/ArborMark";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-white px-6 py-12">
      <ArborMark />
      {clerkEnabled ? (
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
      ) : (
        <div className="max-w-md rounded-2xl bg-white p-5 text-center shadow-card">
          <h1 className="font-display text-xl font-semibold text-ink">
            Clerk auth is not configured
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Add your Clerk keys to `.env.local`, then restart Next.js to enable
            account creation.
          </p>
        </div>
      )}
    </main>
  );
}
