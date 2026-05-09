import { TaskView } from "@/components/task/TaskView";
import Link from "next/link";
import { ArborMark } from "@/components/ui/ArborMark";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-4xl px-6 py-6 pb-12">
      <nav className="flex items-center justify-between">
        <ArborMark as="link" />
        <Link
          href="/"
          className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-700"
        >
          <ArrowLeft
            size={14}
            weight="bold"
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back to Arbor
        </Link>
      </nav>

      <header className="mb-6 mt-8 flex items-center justify-between animate-fade-up">
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          Task
        </h1>
        <code className="rounded-md bg-surface-muted px-2 py-1 font-mono text-[11px] text-ink-muted">
          {id}
        </code>
      </header>
      <TaskView taskId={id} />
    </main>
  );
}
