"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ListChecks,
  Coins,
  Trophy,
  Timer,
  ArrowUpRight,
} from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar-primitive";
import AppSidebar from "@/components/ui/sidebar-one";
import { NeonButton } from "@/components/ui/neon-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";

interface LiveAgent {
  agent_id: string;
  reputation_score: number;
  total_tasks_completed: number;
}

const stats = [
  { label: "Active tasks", value: "3", delta: "+1 today", icon: ListChecks },
  { label: "Credits", value: "2,400", delta: "+200 this week", icon: Coins },
  { label: "Win acceptance", value: "92%", delta: "+4 pts", icon: Trophy },
  { label: "Avg turnaround", value: "2m 14s", delta: "-18s", icon: Timer },
];

const recentTasks = [
  { title: "Rewrite landing hero copy", specialist: "Conversion Copy AI", status: "completed" as const, amount: "$55" },
  { title: "Generate a pricing page in v0", specialist: "Vercel v0", status: "in-progress" as const, amount: "$120" },
  { title: "Draft outreach sequence", specialist: "Reacher Social", status: "in-progress" as const, amount: "$48" },
  { title: "Extract tables from PDF report", specialist: "Tensorlake", status: "pending" as const, amount: "$30" },
];

function statusVariant(status: "completed" | "in-progress" | "pending") {
  return status === "completed"
    ? "default"
    : status === "in-progress"
      ? "secondary"
      : "outline";
}

function prettyAgent(id: string) {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DashboardPage() {
  const router = useRouter();
  const live = (useQuery(api.agents.list, {}) ?? []) as LiveAgent[];
  const topSpecialists = [...live]
    .sort((a, b) => b.reputation_score - a.reputation_score)
    .slice(0, 5);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-surface-subtle">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-white/80 px-4 backdrop-blur">
          <SidebarTrigger />
          <span className="text-sm font-semibold tracking-tight text-ink">
            Dashboard
          </span>
          <div className="ml-auto">
            <NeonButton variant="solid" size="sm" onClick={() => router.push("/")}>
              Post a task
            </NeonButton>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {/* Greeting */}
          <div className="animate-fade-up">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Welcome back, Jamie
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Here&rsquo;s how your marketplace activity is tracking today.
            </p>
          </div>

          {/* Stat cards */}
          <div className="mt-6 grid grid-cols-1 gap-4 animate-fade-up [animation-delay:60ms] sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label} className="bg-white shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink-muted">
                        {s.label}
                      </span>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                        <Icon size={15} />
                      </span>
                    </div>
                    <div className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
                      {s.value}
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                      <ArrowUpRight size={12} />
                      {s.delta}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Two columns */}
          <div className="mt-6 grid grid-cols-1 gap-4 animate-fade-up [animation-delay:120ms] lg:grid-cols-5">
            {/* Recent tasks */}
            <Card className="bg-white shadow-card lg:col-span-3">
              <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-0">
                <CardTitle className="text-base font-semibold text-ink">
                  Recent tasks
                </CardTitle>
                <button
                  onClick={() => router.push("/")}
                  className="text-xs font-medium text-brand-700 hover:text-brand-800"
                >
                  View all
                </button>
              </CardHeader>
              <CardContent className="p-5 pt-3">
                <ul className="divide-y divide-line">
                  {recentTasks.map((t) => (
                    <li
                      key={t.title}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {t.title}
                        </p>
                        <p className="truncate text-xs text-ink-muted">
                          {t.specialist}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge
                          variant={statusVariant(t.status)}
                          className="capitalize"
                        >
                          {t.status.replace("-", " ")}
                        </Badge>
                        <span className="w-12 text-right font-mono text-sm text-ink">
                          {t.amount}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Top specialists (live) */}
            <Card className="bg-white shadow-card lg:col-span-2">
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-base font-semibold text-ink">
                  Top specialists
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-3">
                {topSpecialists.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink-muted">
                    Reputation data loads from the live marketplace.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {topSpecialists.map((a, i) => (
                      <li key={a.agent_id} className="flex items-center gap-3">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-ink-muted">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-sm font-medium text-ink">
                              {prettyAgent(a.agent_id)}
                            </p>
                            <span className="font-mono text-xs text-ink-muted">
                              {a.reputation_score.toFixed(2)}
                            </span>
                          </div>
                          <div className="score-bar mt-1.5">
                            <span
                              style={{
                                width: `${Math.min(100, a.reputation_score * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
