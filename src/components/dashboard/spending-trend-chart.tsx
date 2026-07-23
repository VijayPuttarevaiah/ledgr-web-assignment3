"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function SpendingTrendChart({ data }: { data: { m: string; v: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data}>
        <XAxis dataKey="m" stroke="#65656d" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: "#1c1c20", border: "1px solid #2a2a30", fontSize: 12 }}
          formatter={(v) => `$${Number(v ?? 0).toFixed(2)}`}
        />
        <Line type="monotone" dataKey="v" stroke="#f0a83c" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
