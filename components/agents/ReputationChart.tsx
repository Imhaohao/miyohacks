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
      <div className="flex h-24 items-center justify-center text-[11px] text-terminal-muted">
        no reputation events yet
      </div>
    );
  }

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <XAxis dataKey="index" hide />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: "#737373", fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            ticks={[0, 0.5, 1]}
          />
          <Tooltip
            contentStyle={{
              background: "#0a0a0a",
              border: "1px solid #1f1f1f",
              borderRadius: 4,
              fontSize: 11,
            }}
            labelStyle={{ color: "#737373" }}
            itemStyle={{ color: "#22c55e" }}
            formatter={(v: number) => [v.toFixed(3), "rep"]}
            labelFormatter={(l) => `event ${l}`}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            strokeWidth={1.5}
            dot={{ r: 2, fill: "#22c55e" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
