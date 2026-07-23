"use client";

import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function CashFlowChart({ data }: { data: { label: string; income: number; expense: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid stroke="#2a2a30" vertical={false} />
        <XAxis dataKey="label" stroke="#65656d" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#65656d" fontSize={11} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          contentStyle={{ background: "#1c1c20", border: "1px solid #2a2a30", fontSize: 12 }}
          formatter={(v) => `$${Number(v ?? 0).toFixed(2)}`}
        />
        <Bar dataKey="income" fill="#2fd1a8" radius={[3, 3, 0, 0]} />
        <Bar dataKey="expense" fill="#ef6461" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
