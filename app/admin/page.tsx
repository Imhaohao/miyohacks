import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ArborMark } from "@/components/ui/ArborMark";
import { currentAdminFromCookies } from "@/lib/admin-auth";

export default async function AdminPage() {
  const admin = await currentAdminFromCookies();
  if (!admin) redirect("/admin/login");

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-6 pb-12">
      <nav className="mb-6 flex items-center justify-between">
        <ArborMark />
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-ink-muted">{admin.actor}</span>
          <Link
            href="/"
            className="text-sm font-medium text-ink-muted hover:text-brand-700"
          >
            Back to Arbor
          </Link>
        </div>
      </nav>
      <AdminDashboard />
    </main>
  );
}
