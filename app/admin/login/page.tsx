import Link from "next/link";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { ArborMark } from "@/components/ui/ArborMark";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
      <nav className="flex items-center justify-between">
        <ArborMark />
        <Link
          href="/"
          className="text-sm font-medium text-ink-muted hover:text-brand-700"
        >
          Back to Arbor
        </Link>
      </nav>
      <section className="flex flex-1 items-center justify-center py-12">
        <AdminLoginForm />
      </section>
    </main>
  );
}
