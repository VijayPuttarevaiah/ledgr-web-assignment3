"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export function CategoryPieChart({
  data,
}: {
  data: { id: string; name: string; color: string; cents: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          dataKey="cents"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={48}
          outerRadius={72}
          paddingAngle={2}
          stroke="#141417"
          strokeWidth={2}
        >
          {data.map((c) => (
            <Cell key={c.id} fill={c.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#1c1c20", border: "1px solid #2a2a30", fontSize: 12 }}
          formatter={(v) => `$${(Number(v ?? 0) / 100).toFixed(2)}`}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
