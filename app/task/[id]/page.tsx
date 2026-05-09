import { TaskView } from "@/components/task/TaskView";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.3em] text-terminal-muted hover:text-terminal-text"
        >
          ← Creator Campaign Marketplace
        </Link>
        <code className="text-[10px] text-terminal-muted">{id}</code>
      </header>
      <TaskView taskId={id} />
    </main>
  );
}
