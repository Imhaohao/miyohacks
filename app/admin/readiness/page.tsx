import Link from "next/link";
import { redirect } from "next/navigation";
import { ArborMark } from "@/components/ui/ArborMark";
import { currentAdminFromCookies } from "@/lib/admin-auth";
import { AcceptanceReadiness } from "@/components/admin/AcceptanceReadiness";

export default async function AdminReadinessPage() {
  const admin = await currentAdminFromCookies();
  if (!admin) redirect("/admin/login");

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-6 pb-12">
      <nav className="mb-6 flex items-center justify-between">
        <ArborMark />
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-ink-muted">{admin.actor}</span>
          <Link
            href="/admin"
            className="text-sm font-medium text-ink-muted hover:text-brand-700"
          >
            Back to dashboard
          </Link>
        </div>
      </nav>
      <AcceptanceReadiness />
    </main>
  );
}
