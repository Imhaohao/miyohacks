"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface Point {
  index: number;
  score: number;
}

export function ReputationChart({
  startingScore,
  events,
}: {
  startingScore: number;
  events: Array<{ new_score: number }>;
}) {
  const data: Point[] = [
    { index: 0, score: startingScore },
    ...events.map((e, i) => ({ index: i + 1, score: e.new_score })),
  ];

  if (data.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg bg-surface-subtle text-xs text-ink-muted">
        No reputation events yet
      </div>
    );
  }

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: -28 }}
        >
          <XAxis dataKey="index" hide />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: "#94a3b8", fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            ticks={[0, 0.5, 1]}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 11,
              boxShadow: "0 6px 24px -8px rgba(15,23,42,0.12)",
            }}
            labelStyle={{ color: "#64748b" }}
            itemStyle={{ color: "#1877f2" }}
            formatter={(v: number) => [v.toFixed(3), "rep"]}
            labelFormatter={(l) => `Event ${l}`}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#1877f2"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "#1877f2", strokeWidth: 0 }}
            isAnimationActive
            animationDuration={400}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
