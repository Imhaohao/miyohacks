export function isImplementationTask(prompt: string, taskType: string): boolean {
  const lower = `${taskType} ${prompt}`.toLowerCase();
  return [
    "repo",
    "code",
    "github",
    "implementation",
    "api",
    "backend",
    "frontend",
    "convex",
    "next.js",
    "nextjs",
    "react",
    "stripe",
    "checkout",
    "pricing page",
    "dashboard",
    "experiment",
    "conversion tracking",
    "build",
  ].some((signal) => lower.includes(signal));
}

export function buildTaskContext(prompt: string, taskType: string): string {
  return [`Task type: ${taskType || "general"}`, "", `User goal:`, prompt].join(
    "\n",
  );
}
