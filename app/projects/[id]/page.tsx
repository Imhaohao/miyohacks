import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import type { Id } from "@/convex/_generated/dataModel";
import { ProjectDetailClient } from "@/components/ProjectDetailClient";
import { ArborMark } from "@/components/ui/ArborMark";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-16 pt-6">
      <nav className="flex items-center justify-between">
        <ArborMark />
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-700"
          >
            <ArrowLeft
              size={14}
              weight="bold"
              className="transition-transform group-hover:-translate-x-0.5"
            />
            Projects
          </Link>
          {clerkEnabled && <UserButton />}
        </div>
      </nav>
      <section className="mt-10">
        <ProjectDetailClient projectId={id as Id<"projects">} />
      </section>
    </main>
  );
}
