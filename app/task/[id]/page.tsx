import { TaskView } from "@/components/task/TaskView";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between animate-fade-up">
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-brand-700"
        >
          <ArrowLeft
            size={12}
            weight="bold"
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back to marketplace
        </Link>
        <code className="rounded-md bg-surface-muted px-2 py-1 font-mono text-[11px] text-ink-muted">
          {id}
        </code>
      </header>
      <TaskView taskId={id} />
    </main>
  );
}
